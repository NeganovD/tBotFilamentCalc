// Форма принтера — открывается и со вкладки «Принтеры», и с экрана «Расчёт».
import * as store from './store.js';
import { ICONS, alertDialog, confirmDialog, field, h, numField, sheet, textArea, textInput, toast } from './ui.js';

/** Форма принтера. Возвращает сохранённый принтер, 'deleted' или undefined. */
export function editPrinter(printer = null) {
  const p = printer || {};
  return sheet(printer ? 'Принтер' : 'Новый принтер', close => {
    const name = textInput(p.name, { placeholder: 'Bambu Lab P1S', maxlength: 100 });
    const power = numField({ value: p.power_w, unit: 'Вт' });
    const price = numField({ value: p.price, unit: '₽' });
    const lifetime = numField({ value: p.lifetime_h, unit: 'ч' });
    const maintenance = numField({ value: p.maintenance_per_h, unit: '₽/ч' });
    const note = textArea(p.note, { rows: 2, maxlength: 1000 });

    const save = async () => {
      if (!name.value.trim()) {
        name.focus();
        return toast('Укажите название принтера.');
      }
      try {
        close(await store.savePrinter({
          ...p, name: name.value.trim(), power_w: power.get(), price: price.get(), lifetime_h: lifetime.get(),
          maintenance_per_h: maintenance.get(), note: note.value.trim(),
        }));
      } catch (e) {
        alertDialog('Принтер не сохранён', e.message);
      }
    };
    const remove = printer && (async () => {
      if (!await confirmDialog('Удаление', `Удалить принтер «${p.name}»?`, { ok: 'Удалить', danger: true })) return;
      try {
        await store.removePrinter(p.id);
        close('deleted');
      } catch (e) {
        alertDialog('Принтер не удалён', e.message);
      }
    });
    return {
      body: h('div', { class: 'form' },
        field('Название / модель *', name),
        h('div', { class: 'grid2' },
          field('Мощность при печати', power, 'средняя'),
          field('Стоимость принтера', price),
          field('Ресурс', lifetime, 'срок службы до списания'),
          field('Обслуживание', maintenance, 'сопла, ремни, смазка')),
        field('Примечание', note)),
      actions: [
        remove && h('button', { class: 'btn danger-text', html: ICONS.trash + 'Удалить', onclick: remove }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', text: 'Отмена', onclick: () => close() }),
        h('button', { class: 'btn primary', text: 'Сохранить', onclick: save }),
      ],
    };
  });
}
