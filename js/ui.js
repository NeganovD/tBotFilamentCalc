// Общие элементы интерфейса: построение DOM, окна-«шторки», подтверждения, выбор из списка.
// Урезанная копия pwa/js/ui.js: «Назад» в Telegram — его собственная кнопка BackButton.

/** h('div', {class: 'card', onclick: fn}, child1, 'текст', [child2, child3]) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

// --- числа в полях ввода ---

/** Число из поля: принимает запятую, пробелы; пустое — 0. */
export function parseNum(text) {
  const value = Number(String(text).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

export function numText(value) {
  return value ? String(value).replace('.', ',') : '';
}

/** Поле для числа с подписью единиц справа. */
export function numField({ value = '', unit = '', integer = false, placeholder = '0', oninput, min }) {
  const input = h('input', {
    type: 'text', inputmode: integer ? 'numeric' : 'decimal', autocomplete: 'off', placeholder,
    value: typeof value === 'number' ? numText(value) : value,
  });
  input.addEventListener('input', () => {
    // Только цифры и одна запятая/точка.
    const cleaned = input.value.replace(integer ? /[^\d]/g : /[^\d.,]/g, '');
    if (cleaned !== input.value) input.value = cleaned;
    oninput?.();
  });
  input.addEventListener('focus', () => input.select());
  if (min !== undefined) input.addEventListener('blur', () => { if (parseNum(input.value) < min) { input.value = String(min); oninput?.(); } });
  // Отступ справа — под длину подписи единиц, чтобы число на неё не наезжало.
  if (unit) input.style.paddingRight = `calc(${unit.length}ch + 22px)`;
  const wrap = h('div', { class: 'num-field' }, input, unit && h('span', { class: 'unit', text: unit }));
  wrap.input = input;
  wrap.get = () => parseNum(input.value);
  wrap.set = v => { input.value = numText(v); };
  return wrap;
}

export function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label', text: label }),
    control,
    hint && h('span', { class: 'field-hint', text: hint }));
}

export function textInput(value = '', props = {}) {
  return h('input', { type: 'text', value: value ?? '', autocomplete: 'off', ...props });
}

export function textArea(value = '', props = {}) {
  return h('textarea', { rows: 3, ...props, text: value ?? '' });
}

// --- шторки (диалоги) ---

// Пока открыта хоть одна шторка, «Назад» закрывает верхнюю, а не всё приложение:
// в Telegram — через его кнопку BackButton, в обычном браузере — через запись в истории.
const stack = [];
const tg = window.Telegram?.WebApp;
const backButton = tg?.initData && tg.isVersionAtLeast('6.1') ? tg.BackButton : null;
let ownPops = 0;   // history.back() после закрытия шторки кнопкой — не путать с «Назад»

const inSheetState = () => history.state?.sheet === true;

function closeTop() {
  const top = stack[stack.length - 1];
  if (top && !top.closing) top.close(undefined, true);
}

function syncBack() {
  if (backButton) {
    if (stack.length) backButton.show(); else backButton.hide();
    return;
  }
  if (ownPops > 0) return;   // дождёмся popstate, иначе back() снимет новую запись
  if (stack.length && !inSheetState()) history.pushState({ sheet: true }, '');
  else if (!stack.length && inSheetState()) { ownPops++; history.back(); }
}

if (backButton) {
  backButton.onClick(() => { closeTop(); syncBack(); });
} else {
  window.addEventListener('popstate', () => {
    if (ownPops > 0) {
      ownPops--;
      syncBack();   // пока ждали, могла открыться новая шторка
      return;
    }
    closeTop();
    syncBack();
  });
}

/**
 * Открывает шторку. build(close) возвращает {body, actions?} или просто узел.
 * Возвращает Promise со значением, переданным в close(value).
 */
export function sheet(title, build, { wide = false } = {}) {
  return new Promise(resolve => {
    const dialog = h('dialog', { class: 'sheet' + (wide ? ' wide' : '') });
    const entry = { closing: false, close: null };
    entry.close = (value, fromBack = false) => {
      if (entry.closing) return;
      entry.closing = true;
      stack.splice(stack.indexOf(entry), 1);
      dialog.classList.add('closing');
      setTimeout(() => { dialog.close(); dialog.remove(); }, 160);
      resolve(value);
      // Следующая шторка часто открывается сразу после закрытия этой — решаем после неё.
      if (!fromBack) setTimeout(syncBack, 0);
    };
    const close = value => entry.close(value);
    const built = build(close);
    const { body, actions } = built instanceof Node ? { body: built } : built;
    const header = h('header', {},
      h('h2', { text: title }),
      h('button', { class: 'icon-btn', 'aria-label': 'Закрыть', onclick: () => close(undefined), html: ICONS.close }));
    dialog.append(header, h('div', { class: 'sheet-body' }, body));
    if (actions) dialog.append(h('footer', {}, actions));
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(undefined); });
    dialog.addEventListener('click', e => { if (e.target === dialog) close(undefined); });   // клик по фону
    document.body.append(dialog);
    stack.push(entry);
    syncBack();
    dialog.showModal();
    dialog.querySelector('.sheet-body').scrollTop = 0;
  });
}

export function confirmDialog(title, text, { ok = 'Да', danger = false } = {}) {
  return sheet(title, close => ({
    body: h('p', { class: 'confirm-text', text }),
    actions: [
      h('button', { class: 'btn', text: 'Отмена', onclick: () => close(false) }),
      h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), text: ok, onclick: () => close(true) }),
    ],
  })).then(Boolean);
}

export function alertDialog(title, text) {
  return sheet(title, close => ({
    body: h('p', { class: 'confirm-text', text }),
    actions: [h('button', { class: 'btn primary', text: 'OK', onclick: () => close() })],
  }));
}

/**
 * Выбор из списка. items: [{id, title, subtitle?}].
 * Возвращает выбранный id, 'new' (если есть кнопка добавления) или undefined.
 */
export function pickDialog(title, items, { selected = null, addLabel = null, empty = 'Список пуст.' } = {}) {
  return sheet(title, close => ({
    body: h('div', { class: 'pick-list' }, items.length ? items.map(i => h('button', {
      class: 'pick-item' + (i.id === selected ? ' selected' : ''), onclick: () => close(i.id),
    },
    h('span', { class: 'pick-text' }, h('b', { text: i.title }), i.subtitle && h('small', { text: i.subtitle })),
    i.id === selected && h('span', { class: 'check', html: ICONS.check })))
      : h('p', { class: 'empty', text: empty })),
    actions: addLabel && [h('button', { class: 'btn primary block', text: addLabel, onclick: () => close('new') })],
  }));
}

// --- уведомления ---

/** Верхняя открытая шторка или body: всё, что вне модального окна, оказывается под ним. */
function topHost() {
  return [...document.querySelectorAll('dialog[open]')].pop() || document.body;
}

let toastTimer = null;

export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) el = h('div', { id: 'toast', role: 'status' });
  topHost().append(el);
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// --- поделиться ---

/** В Telegram — выбор чата для отправки текста, в браузере — системное «Поделиться» или буфер обмена. */
export async function shareText(text) {
  if (tg?.initData) {
    tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(text));
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Расчёт скопирован');
  } catch {
    alertDialog('Поделиться', text);
  }
}

// --- иконки (inline SVG, stroke = currentColor) ---

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  calc: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4M8 19h.01M12 19h.01"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  chevron: svg('<path d="m9 18 6-6-6-6"/>'),
  printer: svg('<path d="M4 4h16v16H4z"/><path d="M4 8h16M9 8v4h6V8M8 20v-4h8v4"/>'),
  share: svg('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>'),
  trash: svg('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
};
