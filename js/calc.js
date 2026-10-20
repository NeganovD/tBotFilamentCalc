// Расчёт себестоимости и цен по партиям — порт app/calc.py и app/deadline.py.
// Без зависимостей от DOM: используется и приложением, и тестами.
// Округление повторяет Python round(): точное десятичное значение float, «половинка» — к чётному.

export const DEFAULT_SETTINGS = { electricity_price: 6.0, defect_pct: 10.0, waste_pct: 5.0 };

export const DEFAULT_TIERS = [
  { min_qty: 1, max_qty: 19, multiplier: 75.0 },
  { min_qty: 20, max_qty: 49, multiplier: 25.0 },
  { min_qty: 50, max_qty: 99, multiplier: 15.0 },
  { min_qty: 100, max_qty: null, multiplier: 11.5 },
];

export const FILAMENT_TYPES = [
  'PLA', 'PLA+', 'PLA Silk', 'PLA Matte', 'PLA-CF',
  'PETG', 'PETG-CF', 'PCTG',
  'ABS', 'ASA', 'HIPS',
  'TPU', 'TPE',
  'PA', 'PA-CF', 'PA-GF', 'PC', 'PC-ABS', 'PP',
  'PVA', 'BVOH', 'Wood',
];

export const CUSTOMER_CONTACT_FIELDS = [
  ['contact', 'Контактное лицо'],
  ['phone', 'Телефон'],
  ['email', 'Email'],
  ['messenger', 'Telegram / WhatsApp'],
];
export const CUSTOMER_REQUISITE_FIELDS = [
  ['inn', 'ИНН'],
  ['kpp', 'КПП'],
  ['ogrn', 'ОГРН / ОГРНИП'],
  ['address', 'Юридический адрес'],
  ['bank', 'Банк'],
  ['bik', 'БИК'],
  ['account', 'Расчётный счёт'],
  ['corr_account', 'Корр. счёт'],
];

// --- округление как в Python ---

/** Модуль числа, округлённый до decimals знаков, строкой: "1234.57". */
function roundedDigits(value, decimals) {
  // toFixed(100) даёт точное десятичное представление double (для |x| ≥ ~1e-14 — без потерь).
  const exact = Math.abs(value).toFixed(100);
  const dot = exact.indexOf('.');
  const keep = exact.slice(0, dot) + exact.slice(dot + 1, dot + 1 + decimals);
  const rest = exact.slice(dot + 1 + decimals);
  let roundUp;
  if (rest[0] > '5') roundUp = true;
  else if (rest[0] < '5') roundUp = false;
  else if (/[1-9]/.test(rest.slice(1))) roundUp = true;
  else roundUp = Number(keep[keep.length - 1]) % 2 === 1;   // ровно половинка — к чётному
  let digits = keep;
  if (roundUp) {
    const arr = digits.split('');
    let i = arr.length - 1;
    while (i >= 0 && arr[i] === '9') { arr[i] = '0'; i--; }
    if (i < 0) arr.unshift('1'); else arr[i] = String(Number(arr[i]) + 1);
    digits = arr.join('');
  }
  digits = digits.replace(/^0+(?=\d)/, '').padStart(decimals + 1, '0');
  return decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
}

/** Python round(value, decimals). */
export function pyRound(value, decimals = 0) {
  if (!Number.isFinite(value)) return value;
  const text = roundedDigits(value, decimals);
  const result = Number(text);
  return value < 0 ? -result : result;
}

/** Python f"{value:,.{decimals}f}" с пробелом-разделителем тысяч и запятой. */
export function formatNumber(value, decimals = 2) {
  const text = roundedDigits(value, decimals);
  const [int, frac] = text.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');   // неразрывный пробел: число не переносится
  const sign = value < 0 || Object.is(value, -0) ? '-' : '';   // как Python: «-0,00» тоже со знаком
  return sign + grouped + (frac !== undefined ? ',' + frac : '');
}

export function formatMoney(value) {
  return formatNumber(value, 2) + ' ₽';
}

export function formatHours(hours) {
  const totalMin = pyRound(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin - h * 60;
  return `${h} ч ${String(m).padStart(2, '0')} мин`;
}

// --- партии ---

export function tierContains(t, qty) {
  return t.min_qty <= qty && (t.max_qty === null || t.max_qty === undefined || qty <= t.max_qty);
}

export function tierLabel(t) {
  if (t.max_qty === null || t.max_qty === undefined) return `${t.min_qty}+ шт`;
  if (t.max_qty === t.min_qty) return `${t.min_qty} шт`;
  return `${t.min_qty}–${t.max_qty} шт`;
}

export function sortedTiers(tiers) {
  return [...tiers].sort((a, b) => a.min_qty - b.min_qty);
}

export function tierForQty(tiers, qty) {
  return sortedTiers(tiers).find(t => tierContains(t, qty)) || null;
}

/** Партии из истории. В старых записях нет max_qty — восстанавливаем по следующей партии. */
export function tiersFromDicts(items) {
  const sorted = [...items].sort((a, b) => a.min_qty - b.min_qty);
  return sorted.map((d, idx) => {
    let max_qty;
    if ('max_qty' in d) max_qty = d.max_qty;
    else max_qty = idx + 1 < sorted.length ? sorted[idx + 1].min_qty - 1 : null;
    return { min_qty: d.min_qty, max_qty, multiplier: d.multiplier };
  });
}

export function unitPrice(unitCost, tier) {
  return pyRound(unitCost * tier.multiplier, 2);
}

/** [партия, цена за шт, сумма заказа]. */
export function orderTotal(unitCost, tiers, qty) {
  const tier = tierForQty(tiers, qty);
  if (!tier) return [null, 0, 0];
  const price = unitPrice(unitCost, tier);
  return [tier, price, pyRound(price * qty, 2)];
}

/** [прибыль до вычета налога, её доля в выручке, %]. */
export function profitBeforeTax(revenue, cost) {
  const profit = pyRound(revenue - cost, 2);
  return [profit, revenue ? profit / revenue * 100 : 0];
}

export function validateTiers(tiers) {
  if (!tiers.length) return ['Нужна хотя бы одна партия.'];
  const errors = [];
  const ordered = sortedTiers(tiers);
  if (ordered[0].min_qty !== 1) errors.push('Первая партия должна начинаться с 1 шт.');
  for (const t of ordered) {
    if (t.max_qty !== null && t.max_qty < t.min_qty) errors.push(`Партия ${tierLabel(t)}: «до» меньше, чем «от».`);
    if (t.multiplier <= 0) errors.push(`Партия ${tierLabel(t)}: множитель должен быть больше нуля.`);
  }
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1], cur = ordered[i];
    if (prev.max_qty === null) {
      errors.push(`Партия ${tierLabel(prev)} — «и более», после неё не может быть других партий.`);
    } else if (cur.min_qty <= prev.max_qty) {
      errors.push(`Партии ${tierLabel(prev)} и ${tierLabel(cur)} пересекаются.`);
    } else if (cur.min_qty > prev.max_qty + 1) {
      errors.push(`Между партиями ${tierLabel(prev)} и ${tierLabel(cur)} пропущено ` +
                  `${prev.max_qty + 1}–${cur.min_qty - 1} шт.`);
    }
  }
  const last = ordered[ordered.length - 1];
  if (last.max_qty !== null) errors.push(`Последняя партия (${tierLabel(last)}) должна быть «и более».`);
  return errors;
}

// --- расчёт ---

export const INPUT_DEFAULTS = {
  defect_pct: 0, waste_pct: 0, labor: 0, extra: 0, parts_per_plate: 1, qty: 1,
};

/**
 * inp: weight_g и print_hours — из слайсера для полного стола (parts_per_plate деталей),
 * filament_price_per_kg, printer_power_w, printer_price, printer_lifetime_h, maintenance_per_h,
 * electricity_price, defect_pct, waste_pct, labor (₽ за стол), extra (₽ за 1 шт), parts_per_plate, qty.
 * Статьи расходов — на весь заказ (qty деталей).
 */
export function calculate(input) {
  const inp = { ...INPUT_DEFAULTS, ...input };
  const perPlate = Math.max(inp.parts_per_plate, 1);
  const qty = Math.max(inp.qty, 1);
  const full_plates = Math.floor(qty / perPlate);
  const last_plate_parts = qty % perPlate;
  const plates = full_plates + (last_plate_parts ? 1 : 0);
  // Неполный стол считаем пропорционально числу деталей на нём.
  const plateShare = qty / perPlate;

  const weight = inp.weight_g * (1 + inp.waste_pct / 100) * plateShare;
  const hours = inp.print_hours * plateShare;
  const material = weight / 1000 * inp.filament_price_per_kg;
  const electricity = inp.printer_power_w / 1000 * hours * inp.electricity_price;
  const depreciation = inp.printer_lifetime_h > 0 ? inp.printer_price / inp.printer_lifetime_h * hours : 0;
  const maintenance = inp.maintenance_per_h * hours;
  const print_cost = material + electricity + depreciation + maintenance;
  const defect = print_cost * inp.defect_pct / 100;
  const labor = inp.labor * plates;
  const extra = inp.extra * qty;
  const total_cost = print_cost + defect + labor + extra;
  return {
    material, electricity, depreciation, maintenance, print_cost, defect, labor, extra, total_cost,
    qty,
    unit_cost: total_cost / qty,
    full_plates,
    last_plate_parts,
    weight_g: weight,
    print_hours: hours,
  };
}

export function plural(n, one, few, many) {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return few;
  return many;
}

/** «2 стола: 1 × 78 шт + 1 × 22 шт». */
export function platesText(b, perPlate) {
  const parts = [];
  if (b.full_plates) parts.push(`${b.full_plates} × ${perPlate} шт`);
  if (b.last_plate_parts) parts.push(`1 × ${b.last_plate_parts} шт`);
  const plates = b.full_plates + (b.last_plate_parts ? 1 : 0);
  return `${plates} ${plural(plates, 'стол', 'стола', 'столов')}: ` + parts.join(' + ');
}

/** Цены по всем партиям: для партии заказа — на запрошенное количество, для остальных — на минимум партии. */
export function tierRows(input, tiers, qty) {
  const current = tierForQty(tiers, qty);
  return sortedTiers(tiers).map(tier => {
    const isCurrent = current !== null && tier.min_qty === current.min_qty;
    const tierQty = isCurrent ? qty : tier.min_qty;
    const calc = calculate({ ...input, qty: tierQty });
    const price = unitPrice(calc.unit_cost, tier);
    const total = pyRound(price * tierQty, 2);
    const [profit] = profitBeforeTax(total, calc.total_cost);
    return { tier, isCurrent, qty: tierQty, price, total, profit };
  });
}

// --- сроки ---

/** Сегодняшняя дата в формате YYYY-MM-DD (по местному времени). */
export function todayIso(now = new Date()) {
  return isoDate(now);
}

export function isoDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function formatDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/** «12.10.2026 10:00» из ISO-даты со временем. */
export function formatDateTime(iso) {
  return `${formatDate(iso)} ${iso.slice(11, 16)}`;
}

/** Просрочен — срок прошёл (сегодняшний день ещё не просрочка), а заказ не выполнен. */
export function isOverdue(due, done, today = todayIso()) {
  return !!due && !done && due < today;
}

export function dueText(due, done, today = todayIso()) {
  if (!due) return '—';
  const text = formatDate(due);
  if (done) return text;
  const days = dayNumber(due) - dayNumber(today);
  if (days < 0) return `${text} (просрочен на ${-days} дн.)`;
  if (days === 0) return `${text} (сегодня)`;
  if (days === 1) return `${text} (завтра)`;
  return `${text} (через ${days} дн.)`;
}

/** Местное время в ISO без часового пояса, до секунд — как datetime.now().isoformat(timespec="seconds"). */
export function nowIso(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${isoDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// --- история ---

export function filamentTitle(f) {
  const title = f.type ? `${f.type} — ${f.name}` : f.name;
  return f.manufacturer ? `${title} (${f.manufacturer})` : title;
}

export function perPlate(rec) {
  const inp = rec.data.inputs || {};
  return inp.parts_per_plate ?? inp.parts_count ?? 1;
}

export function platesCount(rec) {
  return Math.ceil(rec.qty / perPlate(rec));
}

/** Себестоимость всего заказа (в старых записях — по себестоимости 1 шт). */
export function recordCost(rec) {
  const b = rec.data.breakdown || {};
  return b.total_cost ?? rec.unit_cost * rec.qty;
}

export function recordProfit(rec) {
  return profitBeforeTax(rec.total, recordCost(rec));
}
