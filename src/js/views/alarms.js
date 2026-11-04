import { state, save, emit, on, uid } from '../store.js';
import { t, lang } from '../i18n.js';
import { computeNextAlarm, alarmDueAt } from '../scheduler.js';
import { soundLabel } from '../sound.js';
import { h, esc, fmtTime, fmtRelative, modal } from '../util.js';
import { icon } from '../icons.js';
import { soundPicker } from './soundpicker.js';

const WEEK_ORDER = () => (lang() === 'ar' ? [6, 0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0]);

function repeatText(a) {
  if (a.date) {
    const [y, m, d] = a.date.split('-').map(Number);
    return new Intl.DateTimeFormat(lang(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' }).format(new Date(y, m - 1, d));
  }
  const days = [...(a.days || [])].sort();
  if (!days.length) return t('alarms.once');
  if (days.length === 7) return t('alarms.everyDay');
  if (days.join() === '1,2,3,4,5') return t('alarms.weekdays');
  if (days.join() === '0,6') return t('alarms.weekends');
  const names = t('weekdaysShort');
  return WEEK_ORDER().filter((d) => days.includes(d)).map((d) => names[d]).join(', ');
}

function timeOf(a) {
  const [hh, mm] = a.time.split(':').map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
}

export function openAlarmEditor(existing) {
  const a = existing ? { ...existing } : { id: uid(), time: '07:00', days: [], date: '', label: '', sound: { kind: 'tone' }, snooze: 10, enabled: true };
  const names = t('weekdaysShort');
  const body = h(`<form class="editor">
    <h2>${icon('alarm-clock')} ${esc(existing ? t('alarms.editAlarm') : t('alarms.newAlarm'))}</h2>
    <label class="field big-time"><span>${esc(t('alarms.time'))}</span><input type="time" name="time" required value="${esc(a.time)}"></label>
    <label class="field"><span>${esc(t('common.label'))}</span><input type="text" name="label" maxlength="60" value="${esc(a.label)}" placeholder="${esc(t('alarms.defaultLabel'))}"></label>
    <div class="field"><span>${esc(t('alarms.repeat'))}</span><div class="day-chips">${WEEK_ORDER().map((d) => `<button type="button" class="chip day ${a.days.includes(d) ? 'on' : ''}" data-d="${d}">${esc(names[d])}</button>`).join('')}</div></div>
    <label class="field"><span>${esc(t('alarms.date'))}</span><input type="date" name="date" value="${esc(a.date || '')}"><small class="muted">${esc(t('alarms.dateHint'))}</small></label>
    <div class="field"><span>${esc(t('alarms.sound'))}</span><div class="sp-host"></div></div>
    <label class="field"><span>${esc(t('alarms.snoozeLen'))}</span><select name="snooze">${[0, 5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${a.snooze === n ? 'selected' : ''}>${n ? `${n} ${t('common.minShort')}` : t('common.off')}</option>`).join('')}</select></label>
    <div class="editor-actions">
      ${existing ? `<button type="button" class="btn danger ghost" data-act="delete">${icon('trash-2')} ${esc(t('common.delete'))}</button>` : '<span></span>'}
      <div class="row gap"><button type="button" class="btn ghost" data-act="cancel">${esc(t('common.cancel'))}</button><button class="btn primary" type="submit">${icon('check')} ${esc(t('common.save'))}</button></div>
    </div>
  </form>`);
  const sp = soundPicker(a.sound);
  body.querySelector('.sp-host').append(sp.el);
  body.querySelectorAll('.chip.day').forEach((c) => { c.onclick = () => c.classList.toggle('on'); });
  const dlg = modal(body, { onClose: () => sp.stopPreview() });
  body.querySelector('[data-act=cancel]').onclick = dlg.close;
  body.querySelector('[data-act=delete]')?.addEventListener('click', () => {
    state.alarms = state.alarms.filter((x) => x.id !== a.id);
    save('alarms'); emit('alarms'); dlg.close();
  });
  body.onsubmit = (e) => {
    e.preventDefault();
    if (!sp.valid) return;
    const f = new FormData(body);
    a.time = f.get('time') || '07:00';
    a.label = String(f.get('label') || '').trim();
    a.date = f.get('date') || '';
    a.days = [...body.querySelectorAll('.chip.day.on')].map((c) => +c.dataset.d);
    a.snooze = +f.get('snooze');
    a.sound = sp.value;
    a.enabled = true;
    a.snoozeAt = null;
    a.nextAt = computeNextAlarm(a);
    if (!a.nextAt) a.enabled = false;
    const i = state.alarms.findIndex((x) => x.id === a.id);
    if (i >= 0) state.alarms[i] = a; else state.alarms.push(a);
    save('alarms'); emit('alarms'); dlg.close();
  };
}

export function alarmsView(root) {
  const el = h(`<div class="list-page">
    <div class="page-actions"><button class="btn primary" data-act="new">${icon('plus')} ${esc(t('alarms.newAlarm'))}</button></div>
    <div class="grid cards"></div>
    <p class="muted small footnote">${icon('info')} ${esc(t('alarms.awakeNote'))}</p>
  </div>`);
  root.append(el);
  el.querySelector('[data-act=new]').onclick = () => openAlarmEditor();
  const grid = el.querySelector('.grid');

  function render() {
    grid.innerHTML = '';
    if (!state.alarms.length) {
      grid.append(h(`<div class="empty card">${icon('alarm-clock', 'xl')}<p class="muted">${esc(t('alarms.noAlarms'))}</p></div>`));
      return;
    }
    const sorted = [...state.alarms].sort((x, y) => x.time.localeCompare(y.time));
    sorted.forEach((a, i) => {
      const card = h(`<article class="card alarm ${a.enabled ? '' : 'disabled'}" style="--i:${i}">
        <div class="alarm-top">
          <div class="alarm-time">${esc(fmtTime(timeOf(a)))}</div>
          <label class="switch" title="${esc(a.enabled ? t('common.on') : t('common.off'))}"><input type="checkbox" ${a.enabled ? 'checked' : ''}><span></span></label>
        </div>
        <div class="alarm-label">${esc(a.label || t('alarms.defaultLabel'))}</div>
        <div class="muted small">${icon('repeat')} ${esc(repeatText(a))}</div>
        <div class="muted small">${icon('music')} ${esc(soundLabel(a.sound))}</div>
        <div class="alarm-foot"><span class="accent-text small next-in"></span>
          <button class="icon-btn" data-act="edit" title="${esc(t('common.edit'))}">${icon('pencil')}</button></div>
      </article>`);
      card.querySelector('input').onchange = (e) => {
        a.enabled = e.target.checked;
        a.snoozeAt = null;
        a.nextAt = a.enabled ? computeNextAlarm(a) : null;
        if (a.enabled && !a.nextAt) { a.enabled = false; e.target.checked = false; }
        save('alarms'); render();
      };
      card.querySelector('[data-act=edit]').onclick = () => openAlarmEditor(a);
      card.dataset.id = a.id;
      grid.append(card);
    });
    tick();
  }
  function tick() {
    const now = Date.now();
    grid.querySelectorAll('.alarm').forEach((c) => {
      const a = state.alarms.find((x) => x.id === c.dataset.id);
      const due = a && a.enabled ? alarmDueAt(a) : null;
      c.querySelector('.next-in').textContent = due
        ? (a.snoozeAt ? t('alarms.snoozed', { time: fmtTime(new Date(a.snoozeAt)) }) : t('alarms.rings', { t: t('common.in', { t: fmtRelative(due - now) }) }))
        : '';
    });
  }
  render();
  const offs = [on('alarms', render), on('settings', render), on('tick', (n) => { if (n % 30000 < 1000) tick(); })];
  return { destroy: () => offs.forEach((f) => f()) };
}
