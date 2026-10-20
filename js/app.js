// Точка входа: Telegram Mini App, навигация по вкладкам, загрузка данных из CloudStorage.
import * as store from './store.js';
import { ICONS, clear, h } from './ui.js';
import * as calcView from './views/calc.js';
import * as printersView from './views/printers.js';
import * as settingsView from './views/settings.js';

const VIEWS = {
  calc: { title: 'Расчёт', icon: ICONS.calc, view: calcView },
  printers: { title: 'Принтеры', icon: ICONS.printer, view: printersView },
  settings: { title: 'Настройки', icon: ICONS.settings, view: settingsView },
};

const tg = window.Telegram?.WebApp;
const main = document.getElementById('view');
const titleEl = document.getElementById('title');
const nav = document.getElementById('nav');

function navigate(name) {
  if (!VIEWS[name]) name = 'calc';
  try { localStorage.setItem('tab', name); } catch { /* недоступно */ }
  titleEl.textContent = VIEWS[name].title;
  document.title = `${VIEWS[name].title} — FilamentCalc`;
  for (const btn of nav.children) btn.classList.toggle('active', btn.dataset.view === name);
  main.className = `view view-${name}`;
  VIEWS[name].view.render(main, { navigate });
  window.scrollTo(0, 0);
}

function buildNav() {
  clear(nav, Object.entries(VIEWS).map(([name, v]) =>
    h('button', { 'data-view': name, onclick: () => navigate(name) },
      h('span', { class: 'nav-icon', html: v.icon }),
      h('span', { class: 'nav-label', text: v.title }))));
}

function setupTelegram() {
  if (!tg?.initData) return;
  const root = document.documentElement;
  root.classList.add('tg');
  const applyScheme = () => { root.style.colorScheme = tg.colorScheme; };
  applyScheme();
  tg.onEvent('themeChanged', applyScheme);
  if (tg.isVersionAtLeast('6.1')) {
    tg.setHeaderColor('secondary_bg_color');
    tg.setBackgroundColor('secondary_bg_color');
  }
  tg.ready();
  tg.expand();
}

async function start() {
  setupTelegram();
  buildNav();
  try {
    await store.init();
  } catch (e) {
    clear(main, h('div', { class: 'card' },
      h('h2', { text: 'Не удалось загрузить данные' }),
      h('p', { text: 'Проверьте интернет и откройте приложение заново.' }),
      h('p', { class: 'muted', text: String(e?.message || e) })));
    return;
  }
  let tab = 'calc';
  try { tab = localStorage.getItem('tab') || 'calc'; } catch { /* недоступно */ }
  navigate(tab);
}

start();
