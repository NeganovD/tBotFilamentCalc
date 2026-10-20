// Хранилище в Telegram CloudStorage: данные лежат на серверах Telegram и видны на всех устройствах аккаунта.
// Открыто вне Telegram (проверка в обычном браузере) — те же ключи в localStorage.
// Ключи: settings, tiers и p_<id> — по ключу на принтер (лимиты: 1024 ключа, значение до 4096 символов).
import { DEFAULT_SETTINGS, DEFAULT_TIERS } from './calc.js';

const tg = window.Telegram?.WebApp;
const cloud = tg?.initData && tg.isVersionAtLeast('6.9') ? tg.CloudStorage : null;
export const inTelegram = !!cloud;

const MAX_VALUE = 4096;
const PRINTER_PREFIX = 'p_';
const LOCAL_PREFIX = 'fc-tg/';

const call = (method, ...args) => new Promise((resolve, reject) =>
  cloud[method](...args, (err, result) => (err ? reject(new Error(`Telegram: ${err}`)) : resolve(result))));

const backend = cloud ? {
  keys: () => call('getKeys'),
  getMany: keys => (keys.length ? call('getItems', keys) : Promise.resolve({})),
  set: (key, value) => call('setItem', key, value),
  remove: key => call('removeItem', key),
} : {
  keys: async () => Object.keys(localStorage).filter(k => k.startsWith(LOCAL_PREFIX)).map(k => k.slice(LOCAL_PREFIX.length)),
  getMany: async keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(LOCAL_PREFIX + k)])),
  set: async (key, value) => localStorage.setItem(LOCAL_PREFIX + key, value),
  remove: async key => localStorage.removeItem(LOCAL_PREFIX + key),
};

let settingsData = { ...DEFAULT_SETTINGS };
let tiersData = DEFAULT_TIERS.map(t => ({ ...t }));
const printersData = new Map();

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function parse(text) {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

async function write(key, value) {
  const text = JSON.stringify(value);
  if (text.length > MAX_VALUE) throw new Error('Запись слишком длинная — сократите примечание.');
  await backend.set(key, text);
}

export async function init() {
  const values = await backend.getMany(await backend.keys());
  for (const [key, text] of Object.entries(values)) {
    const value = parse(text);
    if (!value) continue;
    if (key === 'settings') settingsData = { ...DEFAULT_SETTINGS, ...value };
    else if (key === 'tiers' && Array.isArray(value) && value.length) tiersData = value;
    else if (key.startsWith(PRINTER_PREFIX)) printersData.set(value.id, value);
  }
}

// --- настройки ---

export function settings() {
  return { ...settingsData };
}

export function tiers() {
  return tiersData.map(t => ({ ...t }));
}

export async function saveSettings(values, tierItems) {
  await write('settings', values);
  await write('tiers', tierItems);
  settingsData = { ...values };
  tiersData = tierItems.map(t => ({ ...t }));
}

// --- принтеры ---

export function printers() {
  return [...printersData.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
}

export function getPrinter(id) {
  return printersData.get(id) || null;
}

export async function savePrinter(p) {
  const saved = { ...p, id: p.id ?? newId() };
  await write(PRINTER_PREFIX + saved.id, saved);
  printersData.set(saved.id, saved);
  return saved;
}

export async function removePrinter(id) {
  await backend.remove(PRINTER_PREFIX + id);
  printersData.delete(id);
}
