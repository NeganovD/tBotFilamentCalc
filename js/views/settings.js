// Вкладка «Настройки»: электричество, брак и отходы по умолчанию, партии и множители.
import { DEFAULT_TIERS, tierLabel, validateTiers } from '../calc.js';
import * as store from '../store.js';
import { ICONS, alertDialog, clear, confirmDialog, field, h, numField, toast } from '../ui.js';

export const APP_VERSION = '1.0.0';

export function render(root) {
  const s = store.settings();
  const electricity = numField({ value: s.electricity_price, unit: '₽/кВт·ч', oninput: changed });
  const defect = numField({ value: s.defect_pct, unit: '%', oninput: changed });
  const waste = numField({ value: s.waste_pct, unit: '%', oninput: changed });

  // Партии редактируются строками: от, до (пусто — «и более»), множитель.
  let rows = store.tiers().map(t => ({ ...t }));
  const tiersEl = h('div', { class: 'tiers-editor' });
  const status = h('div', { class: 'tiers-status' });
  const saveBtn = h('button', { class: 'btn primary', text: 'Сохранить настройки', onclick: save });
  const cancelBtn = h('button', { class: 'btn', text: 'Отменить изменения', hidden: true, onclick: () => render(root) });

  function readTiers() {
    return rows.map(r => ({ min_qty: r.min_qty, max_qty: r.max_qty, multiplier: r.multiplier }));
  }

  function changed() {
    const errors = validateTiers(readTiers());
    clear(status, errors.length ? errors.map(e => h('div', { class: 'neg', text: e })) : h('div', { class: 'pos', text: 'Диапазоны в порядке.' }));
    saveBtn.disabled = errors.length > 0;
    cancelBtn.hidden = false;
  }

  function renderTiers() {
    clear(tiersEl,
      h('div', { class: 'tier-row head' }, h('span', { text: 'От, шт' }), h('span', { text: 'До, шт' }), h('span', { text: 'Множитель' }), h('span')),
      rows.map((r, idx) => {
        const from = numField({ value: r.min_qty, integer: true, oninput: () => { r.min_qty = from.get(); changed(); } });
        const to = numField({ value: r.max_qty ?? '', integer: true, placeholder: 'и более',
                              oninput: () => { r.max_qty = to.input.value.trim() ? to.get() : null; changed(); } });
        const mult = numField({ value: r.multiplier, unit: '×', oninput: () => { r.multiplier = mult.get(); changed(); } });
        return h('div', { class: 'tier-row' }, from, to, mult,
          h('button', { class: 'icon-btn danger-text', 'aria-label': `Удалить диапазон ${tierLabel(r)}`, html: ICONS.trash, disabled: rows.length === 1,
                        onclick: () => { rows.splice(idx, 1); renderTiers(); changed(); } }));
      }));
  }

  function addTier() {
    // Новый диапазон — в конец; если последний был «и более», он закрывается.
    const last = rows[rows.length - 1];
    let start = 1;
    if (last) {
      if (last.max_qty === null) last.max_qty = Math.max(last.min_qty, last.min_qty * 2 - 1);
      start = last.max_qty + 1;
    }
    rows.push({ min_qty: start, max_qty: null, multiplier: last ? last.multiplier : 1 });
    renderTiers();
    changed();
  }

  async function resetTiers() {
    if (await confirmDialog('Партии', 'Вернуть партии и множители по умолчанию?')) {
      rows = DEFAULT_TIERS.map(t => ({ ...t }));
      renderTiers();
      changed();
    }
  }

  async function save() {
    const tiers = readTiers();
    const errors = validateTiers(tiers);
    if (errors.length) return alertDialog('Настройки', errors.join('\n'));
    try {
      await store.saveSettings(
        { electricity_price: electricity.get(), defect_pct: defect.get(), waste_pct: waste.get() },
        [...tiers].sort((a, b) => a.min_qty - b.min_qty));
    } catch (e) {
      return alertDialog('Настройки не сохранены', e.message);
    }
    toast('Настройки сохранены');
    render(root);
  }

  renderTiers();
  changed();
  cancelBtn.hidden = true;

  clear(root, h('div', { class: 'settings-grid' },
    h('section', { class: 'card' },
      h('h2', { text: 'Цены и проценты' }),
      h('div', { class: 'form' },
        field('Цена электричества', electricity),
        h('div', { class: 'grid2' },
          field('Брак по умолчанию', defect),
          field('Отходы по умолчанию', waste)),
        h('p', { class: 'muted', text: 'Брак и отходы можно изменить для каждой детали на вкладке «Расчёт».' }))),
    h('section', { class: 'card' },
      h('h2', { text: 'Партии и множители' }),
      h('p', { class: 'muted', text: 'Цена для клиента за 1 шт = себестоимость 1 шт × множитель партии.' }),
      tiersEl,
      status,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn small', html: ICONS.plus + 'Добавить диапазон', onclick: addTier }),
        h('button', { class: 'btn small', text: 'По умолчанию', onclick: resetTiers }))),
    h('div', { class: 'save-row' }, cancelBtn, saveBtn),
    h('p', { class: 'muted small center', text: store.inTelegram
      ? 'Принтеры и настройки хранятся в Telegram и доступны на всех ваших устройствах.'
      : 'Открыто вне Telegram — данные хранятся только в этом браузере.' }),
    h('p', { class: 'muted small center', text: `FilamentCalc для Telegram ${APP_VERSION}` })));
}
