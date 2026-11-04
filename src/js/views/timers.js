// Timers with no upper limit (100 days is fine). Each timer stores its absolute end time, so it keeps counting
// across app restarts and PC shutdowns.
import { state, save, emit, on, uid } from '../store.js';
import { t } from '../i18n.js';
import { soundLabel } from '../sound.js';
import { h, esc, fmtDurationLong, durationParts, fmtDateTime, modal } from '../util.js';
import { icon } from '../icons.js';
import { soundPicker } from './soundpicker.js';

const PRESETS = [[1, 'm'], [5, 'm'], [10, 'm'], [15, 'm'], [30, 'm'], [1, 'h'], [1, 'd'], [7, 'd'], [30, 'd'], [100, 'd']];
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const C = 2 * Math.PI * 54;

function remainingOf(tm, now = Date.now()) {
  if (tm.state === 'running') return Math.max(0, tm.endAt - now);
  if (tm.state === 'paused') return tm.remaining;
  if (tm.state === 'done') return 0;
  return tm.duration;
}

function openTimerEditor() {
  const unit = { d: t('common.days'), h: t('common.hours'), m: t('common.minutes'), s: t('common.seconds') };
  const body = h(`<form class="editor">
    <h2>${icon('hourglass')} ${esc(t('timers.newTimer'))}</h2>
    <div class="dur-inputs">
      ${['d', 'h', 'm', 's'].map((k) => `<label class="dur"><input type="number" name="${k}" min="0" ${k === 'd' ? '' : `max="${k === 'h' ? 23 : 59}"`} value="${k === 'm' ? 5 : 0}" inputmode="numeric"><span>${esc(unit[k])}</span></label>`).join('')}
    </div>
    <div class="chips presets">${PRESETS.map(([n, u]) => `<button type="button" class="chip" data-n="${n}" data-u="${u}">${n}${u === 'd' ? t('common.dayShort') : u === 'h' ? (document.documentElement.lang === 'ar' ? 'س' : document.documentElement.lang === 'tr' ? 'sa' : 'h') : t('common.minShort')}</button>`).join('')}</div>
    <label class="field"><span>${esc(t('common.name'))}</span><input type="text" name="label" maxlength="60" placeholder="${esc(t('timers.defaultLabel'))}"></label>
    <div class="field"><span>${esc(t('alarms.sound'))}</span><div class="sp-host"></div></div>
    <div class="editor-actions"><span></span><div class="row gap"><button type="button" class="btn ghost" data-act="cancel">${esc(t('common.cancel'))}</button>
      <button class="btn primary" type="submit">${icon('play')} ${esc(t('timers.create'))}</button></div></div>
  </form>`);
  const sp = soundPicker({ kind: 'tone' });
  body.querySelector('.sp-host').append(sp.el);
  const dlg = modal(body, { onClose: () => sp.stopPreview() });
  body.querySelector('[data-act=cancel]').onclick = dlg.close;
  body.querySelectorAll('.presets .chip').forEach((c) => {
    c.onclick = () => {
      const vals = { d: 0, h: 0, m: 0, s: 0, [c.dataset.u]: +c.dataset.n };
      for (const [k, v] of Object.entries(vals)) body.elements[k].value = v;
    };
  });
  body.onsubmit = (e) => {
    e.preventDefault();
    if (!sp.valid) return;
    const f = new FormData(body);
    const ms = ['d', 'h', 'm', 's'].reduce((sum, k) => sum + Math.max(0, Number(f.get(k)) || 0) * UNIT_MS[k], 0);
    if (ms < 1000) return;
    state.timers.push({ id: uid(), label: String(f.get('label') || '').trim(), duration: ms, state: 'running', endAt: Date.now() + ms, remaining: ms, sound: sp.value });
    save('timers'); emit('timers'); dlg.close();
  };
}

export function timersView(root) {
  const el = h(`<div class="list-page">
    <div class="page-actions"><button class="btn primary" data-act="new">${icon('plus')} ${esc(t('timers.newTimer'))}</button></div>
    <div class="grid cards"></div>
  </div>`);
  root.append(el);
  el.querySelector('[data-act=new]').onclick = openTimerEditor;
  const grid = el.querySelector('.grid');

  function render() {
    grid.innerHTML = '';
    if (!state.timers.length) {
      grid.append(h(`<div class="empty card">${icon('hourglass', 'xl')}<p class="muted">${esc(t('timers.noTimers'))}</p></div>`));
      return;
    }
    state.timers.forEach((tm, i) => {
      const card = h(`<article class="card timer state-${tm.state}" style="--i:${i}" data-id="${tm.id}">
        <header class="row between"><strong class="ellipsis">${esc(tm.label || t('timers.defaultLabel'))}</strong>
          <button class="icon-btn" data-act="delete" title="${esc(t('common.delete'))}">${icon('trash-2')}</button></header>
        <div class="timer-dial">
          <svg viewBox="0 0 120 120" class="ring-progress"><circle cx="60" cy="60" r="54" class="track"/><circle cx="60" cy="60" r="54" class="bar"/></svg>
          <div class="timer-text"><div class="timer-days"></div><div class="timer-left"></div><div class="muted tiny timer-total">${esc(fmtDurationLong(tm.duration))}</div></div>
        </div>
        <div class="muted small center timer-ends"></div>
        <div class="muted tiny center">${icon('music')} ${esc(soundLabel(tm.sound))}</div>
        <footer class="row gap center">
          <button class="btn round primary" data-act="toggle">${icon(tm.state === 'running' ? 'pause' : 'play')}</button>
          <button class="btn round" data-act="reset" title="${esc(t('common.reset'))}">${icon('rotate-ccw')}</button>
        </footer>
      </article>`);
      card.querySelector('[data-act=delete]').onclick = () => { state.timers = state.timers.filter((x) => x.id !== tm.id); save('timers'); render(); };
      card.querySelector('[data-act=toggle]').onclick = () => {
        const now = Date.now();
        if (tm.state === 'running') { tm.remaining = Math.max(0, tm.endAt - now); tm.state = 'paused'; }
        else { const rem = tm.state === 'paused' ? tm.remaining : tm.duration; tm.endAt = now + rem; tm.state = 'running'; }
        save('timers'); render();
      };
      card.querySelector('[data-act=reset]').onclick = () => { tm.state = 'idle'; tm.remaining = tm.duration; save('timers'); render(); };
      grid.append(card);
    });
    tick();
  }
  function tick() {
    const now = Date.now();
    grid.querySelectorAll('.timer').forEach((c) => {
      const tm = state.timers.find((x) => x.id === c.dataset.id);
      if (!tm) return;
      const rem = remainingOf(tm, now);
      const parts = durationParts(rem);
      c.querySelector('.timer-left').textContent = tm.state === 'done' ? t('timers.done') : parts.hms;
      c.querySelector('.timer-days').textContent = tm.state !== 'done' && parts.days ? `${parts.days} ${t('common.days')}` : '';
      c.querySelector('.bar').style.strokeDashoffset = String(C * (1 - rem / tm.duration));
      c.querySelector('.timer-ends').textContent = tm.state === 'running' ? t('timers.ends', { time: fmtDateTime(new Date(tm.endAt)) }) : '';
    });
  }
  render();
  const offs = [on('timers', render), on('tick', tick), on('settings', render)];
  return { destroy: () => offs.forEach((f) => f()) };
}
