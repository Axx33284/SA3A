// One heartbeat for the whole app. Every second it checks timers, alarms and prayer times against the time window
// since the previous beat, so events that fell inside a sleep/hibernate gap are still caught on wake-up.
import { state, save, emit, on } from './store.js';
import { prayerTimes, PRAYERS } from './prayer.js';
import { t } from './i18n.js';
import { fmtTime, dayKey } from './util.js';
import { ring, notify } from './ring.js';

const LATE_RING_MS = 10 * 60 * 1000; // ring if we're at most 10 minutes late (e.g. PC just woke up)
let last = Date.now();

// ---------- alarms ----------
export function computeNextAlarm(a, after = Date.now()) {
  const [hh, mm] = (a.time || '07:00').split(':').map(Number);
  if (a.date) {
    const [y, m, d] = a.date.split('-').map(Number);
    const at = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
    return at > after ? at : null;
  }
  const base = new Date(after);
  for (let i = 0; i < 8; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, hh, mm, 0, 0);
    if (d.getTime() > after && (!a.days?.length || a.days.includes(d.getDay()))) return d.getTime();
  }
  return null;
}

export function alarmDueAt(a) {
  return a.snoozeAt || a.nextAt || null;
}

function checkAlarms(now) {
  let changed = false;
  for (const a of state.alarms) {
    if (!a.enabled) continue;
    const due = alarmDueAt(a);
    if (!due || due > now) continue;
    const late = now - due;
    a.snoozeAt = null;
    if (a.days?.length && !a.date) {
      a.nextAt = computeNextAlarm(a, now);
    } else {
      a.enabled = false;
      a.nextAt = null;
    }
    changed = true;
    if (late <= LATE_RING_MS) {
      ring({ type: 'alarm', id: a.id, title: a.label || t('alarms.defaultLabel'), time: new Date(due), sound: a.sound, loop: true, snooze: a.snooze ?? 10 });
    } else {
      notify(t('alarms.missed'), `${a.label || t('alarms.defaultLabel')} · ${fmtTime(new Date(due))}`);
    }
  }
  if (changed) { save('alarms'); emit('alarms'); }
}

// ---------- timers ----------
function checkTimers(now) {
  let changed = false;
  for (const tm of state.timers) {
    if (tm.state !== 'running' || tm.endAt > now) continue;
    tm.state = 'done';
    tm.remaining = 0;
    changed = true;
    if (now - tm.endAt <= LATE_RING_MS) {
      ring({ type: 'timer', id: tm.id, title: tm.label || t('timers.defaultLabel'), time: new Date(tm.endAt), sound: tm.sound, loop: true });
    } else {
      notify(t('timers.done'), `${tm.label || t('timers.defaultLabel')} · ${fmtTime(new Date(tm.endAt))}`);
    }
  }
  if (changed) { save('timers'); emit('timers'); }
}

// ---------- prayers ----------
const dayCache = new Map();
on('settings', () => dayCache.clear());
on('location', () => dayCache.clear());

export function timesForDay(date) {
  const loc = state.settings.location;
  if (!loc) return null;
  const k = dayKey(date);
  if (!dayCache.has(k)) {
    if (dayCache.size > 10) dayCache.clear();
    dayCache.set(k, prayerTimes(date, state.settings, loc));
  }
  return dayCache.get(k);
}

function checkPrayers(from, now) {
  if (!state.settings.location) return;
  const days = new Set([dayKey(new Date(from)), dayKey(new Date(now))]);
  const s = state.settings;
  for (const k of days) {
    const [y, m, d] = k.split('-').map(Number);
    const r = timesForDay(new Date(y, m - 1, d));
    if (!r) continue;
    for (const p of PRAYERS) {
      const mode = s.prayerModes[p] || 'off';
      if (mode === 'off') continue;
      const at = r.times[p].getTime();
      const name = p === 'dhuhr' && r.isFriday ? t('prayers.jumuah') : t(`prayers.${p}`);
      if (s.reminderMin > 0 && p !== 'sunrise') {
        const rem = at - s.reminderMin * 60000;
        if (rem > from && rem <= now) notify(t('prayer.reminder', { prayer: name, n: s.reminderMin }), fmtTime(r.times[p]));
      }
      if (at > from && at <= now && now - at <= LATE_RING_MS) {
        ring({
          type: 'prayer', id: p, title: t('prayer.timeFor', { prayer: name }), time: r.times[p], prayer: p,
          sound: mode === 'sound' && p !== 'sunrise' ? (p === 'fajr' ? s.fajrSound : s.azanSound) : null,
          notifyOnly: mode === 'notify' || p === 'sunrise',
        });
      }
    }
  }
}

function beat() {
  const now = Date.now();
  // A clock change backwards (or a first beat) must not replay events.
  const from = now < last ? now - 1000 : last;
  checkTimers(now);
  checkAlarms(now);
  checkPrayers(from, now);
  last = now;
  emit('tick', now);
}

export function startScheduler() {
  // Recompute every alarm's next time at launch (the PC may have been off for days).
  const now = Date.now();
  for (const a of state.alarms) {
    if (a.enabled && !a.snoozeAt && (!a.nextAt || a.nextAt < now - LATE_RING_MS)) {
      const missed = a.nextAt && a.nextAt < now;
      if (missed) notify(t('alarms.missed'), `${a.label || t('alarms.defaultLabel')} · ${fmtTime(new Date(a.nextAt))}`);
      a.nextAt = computeNextAlarm(a, now);
      if (!a.nextAt) a.enabled = false;
    }
  }
  save('alarms');
  last = now - 1000;
  const loop = () => {
    beat();
    setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
  };
  loop();
  window.sa3a.onResume(() => beat());
}
