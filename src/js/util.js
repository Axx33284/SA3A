import { state } from './store.js';
import { lang, t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function h(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

const fmtCache = new Map();
function fmt(key, opts) {
  const k = `${lang()}|${key}|${state.settings.timeFormat}`;
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat(lang(), { numberingSystem: 'latn', ...opts }));
  return fmtCache.get(k);
}
export const clearFormatCache = () => fmtCache.clear();

export function fmtTime(date, { seconds = false, tz } = {}) {
  const h12 = state.settings.timeFormat === '12';
  const opts = { hour: '2-digit', minute: '2-digit', hour12: h12, ...(seconds ? { second: '2-digit' } : {}), ...(tz ? { timeZone: tz } : {}) };
  return fmt(`time${seconds}${tz || ''}`, opts).format(date);
}

export function fmtDate(date, style = 'long', tz) {
  const opts = style === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : style === 'medium' ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'long', year: 'numeric' };
  return fmt(`date${style}${tz || ''}`, { ...opts, ...(tz ? { timeZone: tz } : {}) }).format(date);
}

export function fmtWeekday(date) {
  return fmt('weekday', { weekday: 'long' }).format(date);
}

export function fmtDateTime(date) {
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay ? fmtTime(date) : `${fmtDate(date, 'medium')} · ${fmtTime(date)}`;
}

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

/** 3d 04:05:06 – no upper limit. */
export function fmtDuration(ms, { cs = false } = {}) {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const totalSec = cs ? Math.floor(ms / 1000) : Math.ceil(ms / 1000 - 1e-9);
  const d = Math.floor(totalSec / 86400);
  const hh = Math.floor((totalSec % 86400) / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  let s = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  if (cs) s += `.${pad((ms % 1000) / 10)}`;
  if (d) s = `${d}${t('common.dayShort')} ${s}`;
  return (neg ? '-' : '') + s;
}

/** Long durations as "100 days" + "HH:MM:SS" for display on two lines. */
export function durationParts(ms) {
  const totalSec = Math.ceil(Math.max(0, ms) / 1000 - 1e-9);
  const days = Math.floor(totalSec / 86400);
  return { days, hms: fmtDuration((totalSec % 86400) * 1000) };
}

export function fmtDurationLong(ms) {
  const { days, hms } = durationParts(ms);
  if (!days) return hms;
  return hms === '00:00:00' ? `${days} ${t('common.days')}` : `${days} ${t('common.days')} ${hms}`;
}

/** Human "in 3 h 20 min" style text for alarms. */
export function fmtRelative(ms) {
  const min = Math.round(ms / 60000);
  const d = Math.floor(min / 1440);
  const hh = Math.floor((min % 1440) / 60);
  const mm = min % 60;
  const parts = [];
  if (d) parts.push(`${d}${t('common.dayShort')}`);
  if (hh) parts.push(`${hh}${lang() === 'ar' ? 'س' : lang() === 'tr' ? 'sa' : 'h'}`);
  if (mm || !parts.length) parts.push(`${mm}${t('common.minShort')}`);
  return parts.join(' ');
}

export function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

/** Modal dialog. Returns { el, close }. `content` is an element. */
export function modal(content, { onClose, wide = false } = {}) {
  const back = h(`<div class="modal-backdrop" role="presentation"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"></div></div>`);
  back.firstElementChild.append(content);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
  const close = () => {
    back.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    const done = () => back.remove();
    if (document.documentElement.dataset.motion === 'off') done();
    else setTimeout(done, 200);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  setTimeout(() => back.querySelector('input:not([type=hidden]),select,button')?.focus(), 50);
  return { el: back.firstElementChild, close };
}

export function toast(msg, ms = 3500) {
  let host = $('#toasts');
  const el = h(`<div class="toast">${esc(msg)}</div>`);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}
