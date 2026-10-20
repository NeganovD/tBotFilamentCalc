// Вкладка «Расчёт»: принтер → цена филамента → параметры заказа → себестоимость, цены по партиям, итог.
import {
  calculate, formatHours, formatMoney, formatNumber, orderTotal, platesText, profitBeforeTax, tierLabel, tierRows,
} from '../calc.js';
import { editPrinter } from '../forms.js';
import * as store from '../store.js';
import { ICONS, clear, field, h, numField, pickDialog, shareText } from '../ui.js';

const DRAFT_KEY = 'calc-draft';

const BREAKDOWN_ROWS = [
  ['material', 'Материал (с отходами)'],
  ['electricity', 'Электричество'],
  ['depreciation', 'Амортизация принтера'],
  ['maintenance', 'Обслуживание'],
  ['defect', 'Брак'],
  ['labor', 'Работа'],
  ['extra', 'Доп. расходы'],
];

// Черновик расчёта живёт между переключениями вкладок и перезапусками (только на этом устройстве).
let draft = loadDraft();

function loadDraft() {
  const defaults = { printer_id: null, filament_price: 0, qty: 1, parts: 1, weight: 0, hours: 0, minutes: 0,
                     defect: null, waste: null, labor: 0, extra: 0 };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') };
  } catch {
    return defaults;
  }
}

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* недоступно */ }
}

export function render(root) {
  const settings = store.settings();
  const tiers = store.tiers();
  if (draft.defect === null) draft.defect = settings.defect_pct;
  if (draft.waste === null) draft.waste = settings.waste_pct;

  const printers = store.printers();
  // Выбранный могли удалить — берём первый из списка.
  let printer = printers.find(p => p.id === draft.printer_id) || printers[0] || null;
  draft.printer_id = printer?.id ?? null;

  // --- 1. Принтер ---
  const printerCard = h('section', { class: 'card' });
  const renderPrinter = () => {
    if (!printer) {
      return clear(printerCard, h('h2', { text: '1. Принтер' }),
        h('div', { class: 'empty-step' },
          h('p', { text: 'Принтер не добавлен. Начните с него — без принтера расчёт невозможен.' }),
          h('button', { class: 'btn primary', html: ICONS.plus + 'Добавить принтер', onclick: addPrinter })));
    }
    const depr = printer.lifetime_h > 0 ? printer.price / printer.lifetime_h : 0;
    clear(printerCard, h('h2', { text: '1. Принтер' }),
      h('button', { class: 'select-row', onclick: choosePrinter },
        h('span', { class: 'pick-text' },
          h('b', { text: printer.name }),
          h('small', { text: `${formatNumber(printer.power_w, 0)} Вт · амортизация ${formatMoney(depr)}/ч · ` +
                              `обслуживание ${formatMoney(printer.maintenance_per_h)}/ч · ` +
                              `электричество ${formatMoney(settings.electricity_price)}/кВт·ч` })),
        h('span', { class: 'chevron', html: ICONS.chevron })));
  };
  async function addPrinter() {
    const saved = await editPrinter();
    if (saved && saved !== 'deleted') selectPrinter(saved);
  }
  async function choosePrinter() {
    const id = await pickDialog('Принтер', store.printers().map(p => ({
      id: p.id, title: p.name, subtitle: `${formatNumber(p.power_w, 0)} Вт`,
    })), { selected: printer?.id, addLabel: '+ Новый принтер' });
    if (id === 'new') return addPrinter();
    if (id) selectPrinter(store.getPrinter(id));
  }
  function selectPrinter(p) {
    printer = p;
    draft.printer_id = p.id;
    update();
  }

  // --- 2–3. Филамент, заказ и печать ---
  const num = (key, opts) => numField({ value: draft[key], oninput: onInput, ...opts });
  const inputs = {
    filament_price: num('filament_price', { unit: '₽/кг' }),
    qty: num('qty', { unit: 'шт', integer: true, min: 1, placeholder: '1' }),
    parts: num('parts', { unit: 'шт', integer: true, min: 1, placeholder: '1' }),
    weight: num('weight', { unit: 'г' }),
    hours: num('hours', { unit: 'ч', integer: true }),
    minutes: num('minutes', { unit: 'мин', integer: true }),
    defect: num('defect', { unit: '%' }),
    waste: num('waste', { unit: '%' }),
    labor: num('labor', { unit: '₽' }),
    extra: num('extra', { unit: '₽' }),
  };
  function onInput() {
    for (const [key, input] of Object.entries(inputs)) draft[key] = input.get();
    if (draft.minutes > 59) { draft.minutes = 59; inputs.minutes.set(59); }
    updateResults();
  }
  const filamentCard = h('section', { class: 'card' },
    h('h2', { text: '2. Филамент' }),
    field('Стоимость катушки за 1 кг', inputs.filament_price));
  const platesInfo = h('div', { class: 'plates-info' });
  const paramsCard = h('section', { class: 'card' },
    h('h2', { text: '3. Заказ и печать' }),
    h('div', { class: 'grid2' },
      field('Нужно напечатать', inputs.qty, 'весь заказ'),
      field('Помещается на стол', inputs.parts, 'для этого стола — вес и время')),
    h('h3', { class: 'form-section', text: 'Из слайсера — для полного стола' }),
    h('div', { class: 'grid2' },
      field('Вес', inputs.weight),
      field('Время печати', h('div', { class: 'time-row' }, inputs.hours, inputs.minutes))),
    h('h3', { class: 'form-section', text: 'Прочие расходы' }),
    h('div', { class: 'grid2' },
      field('Брак', inputs.defect),
      field('Отходы', inputs.waste, 'поддержки, юбка, брим, purge'),
      field('Работа, за стол', inputs.labor, 'подготовка, запуск, снятие'),
      field('Доп. расходы, за 1 шт', inputs.extra, 'магниты, вставки, упаковка')),
    platesInfo);

  // --- результаты ---
  const costCard = h('section', { class: 'card' });
  const tiersCard = h('section', { class: 'card' });
  const orderCard = h('section', { class: 'card order-card' });
  const totalBar = h('div', { class: 'total-bar' });

  function buildInput() {
    if (!printer) return null;
    return {
      weight_g: draft.weight,
      print_hours: draft.hours + draft.minutes / 60,
      filament_price_per_kg: draft.filament_price,
      printer_power_w: printer.power_w,
      printer_price: printer.price,
      printer_lifetime_h: printer.lifetime_h,
      maintenance_per_h: printer.maintenance_per_h,
      electricity_price: settings.electricity_price,
      defect_pct: draft.defect,
      waste_pct: draft.waste,
      labor: draft.labor,
      extra: draft.extra,
      parts_per_plate: Math.max(draft.parts, 1),
      qty: Math.max(draft.qty, 1),
    };
  }

  function updateResults() {
    saveDraft();
    const ready = !!printer;
    filamentCard.classList.toggle('disabled', !ready);
    paramsCard.classList.toggle('disabled', !ready);
    for (const card of [costCard, tiersCard, orderCard]) card.hidden = !ready;
    totalBar.hidden = !ready;
    const input = buildInput();
    if (!input) return clear(platesInfo);
    const b = calculate(input);
    const qty = input.qty;

    clear(platesInfo,
      h('b', { text: platesText(b, input.parts_per_plate) }),
      h('div', { text: `Филамент на заказ ≈ ${formatNumber(b.weight_g, 0)} г, время печати ≈ ${formatHours(b.print_hours)}` }),
      h('div', { class: 'muted', text: `На 1 деталь: ${formatNumber(input.weight_g / input.parts_per_plate)} г, ` +
                                       `${formatHours(input.print_hours / input.parts_per_plate)}` }));

    clear(costCard, h('h2', { text: 'Себестоимость' }),
      h('table', { class: 'money-table' },
        h('thead', {}, h('tr', {}, h('th'), h('th', { text: `Весь заказ (${qty} шт)` }), h('th', { text: '1 шт' }))),
        h('tbody', {},
          BREAKDOWN_ROWS.map(([key, title]) => h('tr', {},
            h('td', { text: title }), h('td', { text: formatMoney(b[key]) }), h('td', { text: formatMoney(b[key] / qty) }))),
          h('tr', { class: 'total' },
            h('td', { text: 'Себестоимость' }), h('td', { text: formatMoney(b.total_cost) }), h('td', { text: formatMoney(b.unit_cost) })))));

    clear(tiersCard, h('h2', { text: 'Цены по партиям' }),
      h('div', { class: 'tier-list' }, tierRows(input, tiers, qty).map(r => h('div', { class: 'tier' + (r.isCurrent ? ' current' : '') },
        h('div', { class: 'tier-head' },
          h('b', { text: tierLabel(r.tier) }),
          h('span', { class: 'muted', text: `× ${formatNumber(r.tier.multiplier)}` }),
          r.isCurrent && h('span', { class: 'badge', text: 'ваш заказ' })),
        h('dl', {},
          h('div', {}, h('dt', { text: 'Цена за 1 шт' }), h('dd', { text: formatMoney(r.price) })),
          h('div', {}, h('dt', { text: `Сумма за ${r.qty} шт` }), h('dd', { text: formatMoney(r.total) })),
          h('div', {}, h('dt', { text: 'Прибыль' }), h('dd', { class: r.profit >= 0 ? 'pos' : 'neg', text: formatMoney(r.profit) })))))));

    const [tier, price, total] = orderTotal(b.unit_cost, tiers, qty);
    const [profit, margin] = profitBeforeTax(total, b.total_cost);
    clear(orderCard, h('h2', { text: 'Заказ' }),
      h('dl', { class: 'kv' },
        h('div', {}, h('dt', { text: 'Партия' }), h('dd', { text: tier ? `${tierLabel(tier)} (× ${formatNumber(tier.multiplier)})` : 'нет подходящей партии' })),
        h('div', {}, h('dt', { text: 'Цена за 1 шт' }), h('dd', { text: formatMoney(price) })),
        h('div', { class: 'big' }, h('dt', { text: 'Итого для клиента' }), h('dd', { text: formatMoney(total) })),
        h('div', {}, h('dt', { text: 'Себестоимость заказа' }), h('dd', { text: formatMoney(b.total_cost) })),
        h('div', {}, h('dt', { text: 'Прибыль до вычета налога' }),
          h('dd', { class: profit >= 0 ? 'pos' : 'neg', text: `${formatMoney(profit)} (${formatNumber(margin, 1)} %)` }))));

    clear(totalBar,
      h('div', { class: 'total-bar-text' },
        h('small', { text: `${qty} шт × ${formatMoney(price)}` }),
        h('b', { text: formatMoney(total) })),
      h('button', { class: 'btn primary', html: ICONS.share + 'Поделиться', disabled: !(input.weight_g > 0),
                    onclick: () => shareText(shareMessage(qty, price, total)) }));
  }

  // Текст для заказчика: только цена — без себестоимости и прибыли.
  function shareMessage(qty, price, total) {
    return ['Расчёт 3D-печати',
            `Количество: ${qty} шт`,
            `Цена за 1 шт: ${formatMoney(price)}`,
            `Итого: ${formatMoney(total)}`].join('\n');
  }

  function update() {
    saveDraft();
    renderPrinter();
    updateResults();
  }

  clear(root,
    h('div', { class: 'calc-grid' },
      h('div', { class: 'col' }, printerCard, filamentCard, paramsCard),
      h('div', { class: 'col' }, costCard, tiersCard, orderCard)),
    totalBar);
  update();
}
