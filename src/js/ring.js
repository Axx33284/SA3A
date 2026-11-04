// The full-window "ringing" card for alarms, timers and azan, plus system notifications.
import { state, save, emit } from './store.js';
import { t } from './i18n.js';
import { play } from './sound.js';
import { h, esc, fmtTime } from './util.js';
import { icon } from './icons.js';

const queue = [];
let active = null;
const AUTO_STOP_MS = 15 * 60 * 1000;

export function notify(title, body, silent = true) {
  window.sa3a.notify({ title, body, silent });
}

export function ring(item) {
  if (item.type === 'prayer') {
    notify(item.title, fmtTime(item.time), !item.notifyOnly);
    if (item.notifyOnly || !item.sound) return;
  } else {
    notify(item.title, fmtTime(item.time), true);
  }
  queue.push(item);
  if (!active) next();
}

function next() {
  active = queue.shift() || null;
  const host = document.getElementById('ring');
  if (!active) {
    host.classList.remove('open');
    setTimeout(() => { if (!active) host.innerHTML = ''; }, 300);
    return;
  }
  const it = active;
  if (it.type !== 'prayer' || state.settings.showOnAzan) window.sa3a.showWindow();
  else window.sa3a.flashWindow();

  const iconName = it.type === 'alarm' ? 'alarm-clock' : it.type === 'timer' ? 'hourglass' : 'moon-star';
  const sub = it.type === 'prayer' ? t('prayer.azanPlaying') : it.type === 'timer' ? t('timers.done') : t('nav.alarms');
  const buttons = it.type === 'alarm'
    ? (it.snooze ? `<button class="btn ghost" data-act="snooze">${icon('rotate-ccw')} ${esc(t('common.snooze'))} · ${it.snooze} ${esc(t('common.minShort'))}</button>` : '')
      + `<button class="btn primary" data-act="dismiss">${esc(t('common.dismiss'))}</button>`
    : it.type === 'timer'
      ? `<button class="btn ghost" data-act="restart">${icon('rotate-ccw')} ${esc(t('common.restart'))}</button><button class="btn primary" data-act="dismiss">${esc(t('common.dismiss'))}</button>`
      : `<button class="btn primary" data-act="dismiss">${icon('volume-x')} ${esc(t('prayer.stopAzan'))}</button>`;

  host.innerHTML = '';
  host.append(h(`<div class="ring-card ring-${it.type}">
    <div class="ring-pulse">${icon(iconName, 'xl')}</div>
    <div class="ring-time">${esc(fmtTime(it.time))}</div>
    <div class="ring-title">${esc(it.title)}</div>
    <div class="ring-sub muted">${esc(sub)}</div>
    <div class="ring-actions">${buttons}</div>
  </div>`));
  requestAnimationFrame(() => host.classList.add('open'));

  const player = play(it.sound, { loop: it.loop, volume: state.settings.volume });
  const autoStop = setTimeout(() => finish('dismiss'), it.loop ? AUTO_STOP_MS : 30 * 60 * 1000);
  if (!it.loop) player.done.then(() => setTimeout(() => { if (active === it) finish('dismiss'); }, 1500));

  function finish(act) {
    if (active !== it) return;
    clearTimeout(autoStop);
    player.stop();
    if (act === 'snooze' && it.type === 'alarm') {
      const a = state.alarms.find((x) => x.id === it.id);
      if (a) {
        a.snoozeAt = Date.now() + it.snooze * 60000;
        a.enabled = true;
        save('alarms');
        emit('alarms');
      }
    }
    if (act === 'restart' && it.type === 'timer') {
      const tm = state.timers.find((x) => x.id === it.id);
      if (tm) {
        tm.state = 'running';
        tm.endAt = Date.now() + tm.duration;
        save('timers');
        emit('timers');
      }
    }
    next();
  }
  host.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => finish(b.dataset.act); });
  host.querySelector('.btn.primary')?.focus();
}
