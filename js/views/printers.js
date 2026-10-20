// Вкладка «Принтеры»: список и редактирование.
import { formatMoney, formatNumber } from '../calc.js';
import { editPrinter } from '../forms.js';
import * as store from '../store.js';
import { ICONS, clear, h } from '../ui.js';

export function render(root) {
  const printers = store.printers();
  const edit = async p => { if (await editPrinter(p)) render(root); };
  clear(root,
    printers.length ? h('div', { class: 'list' }, printers.map(p => {
      const depr = p.lifetime_h > 0 ? p.price / p.lifetime_h : 0;
      return h('button', { class: 'list-item', onclick: () => edit(p) },
        h('span', { class: 'thumb-empty', html: ICONS.printer }),
        h('span', { class: 'pick-text' },
          h('b', { text: p.name }),
          h('small', { text: `${formatNumber(p.power_w, 0)} Вт · ${formatMoney(p.price)} · ресурс ${formatNumber(p.lifetime_h, 0)} ч` }),
          h('small', { text: `амортизация ${formatMoney(depr)}/ч · обслуживание ${formatMoney(p.maintenance_per_h)}/ч` }),
          p.note && h('small', { class: 'muted', text: p.note })),
        h('span', { class: 'chevron', html: ICONS.chevron }));
    })) : h('p', { class: 'empty', text: 'Принтеров пока нет. Нажмите «+», чтобы добавить.' }),
    h('button', { class: 'fab', 'aria-label': 'Добавить принтер', title: 'Добавить принтер', html: ICONS.plus, onclick: () => edit(null) }));
}
