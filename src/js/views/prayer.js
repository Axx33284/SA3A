import { state, updateSettings, on } from '../store.js';
import { t } from '../i18n.js';
import { PRAYERS, METHODS, resolveMethod, formatHijri, hijriParts, nextPrayer } from '../prayer.js';
import { timesForDay } from '../scheduler.js';
import { h, esc, fmtTime, fmtDate, fmtWeekday, fmtDuration } from '../util.js';
import { icon } from '../icons.js';
import { openLocationDialog } from '../location.js';

const MODE_NEXT = { sound: 'notify', notify: 'off', off: 'sound' };
const MODE_ICON = { sound: 'volume-2', notify: 'bell', off: 'bell-off' };
const MODE_LABEL = { sound: 'prayer.modeSound', notify: 'prayer.modeNotify', off: 'prayer.modeOff' };

export function prayerView(root, { go }) {
  let offset = 0; // days from today being shown
  const s = state.settings;

  if (!s.location) {
    root.append(h(`<section class="empty-hero card">
      <div class="hero-icon">${icon('moon-star', 'xl')}</div>
      <h2>${esc(t('prayer.setLocation'))}</h2>
      <p class="muted">${esc(t('prayer.noLocation'))}</p>
      <div class="row gap center wrap">
        <button class="btn primary" data-act="loc">${icon('search')} ${esc(t('prayer.search'))}</button>
        <button class="btn" data-act="map">${icon('map')} ${esc(t('prayer.pickOnMap'))}</button>
      </div>
    </section>`));
    root.querySelector('[data-act=loc]').onclick = () => openLocationDialog({ onPickOnMap: () => go('qibla') });
    root.querySelector('[data-act=map]').onclick = () => go('qibla');
    return { destroy: on('location', () => setTimeout(() => go('prayer'))) };
  }

  const el = h(`<div class="prayer-layout">
    <section class="card hero">
      <button class="place" data-act="loc" title="${esc(t('prayer.changeLocation'))}">${icon('map-pin')}<span></span></button>
      <div class="clock-big" aria-live="off"></div>
      <div class="next-wrap">
        <svg class="ring-progress" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="track"/><circle cx="60" cy="60" r="54" class="bar"/></svg>
        <div class="next-text"><div class="next-label muted"></div><div class="countdown"></div></div>
      </div>
      <div class="ramadan-banner" hidden></div>
    </section>
    <section class="card times">
      <header class="day-nav">
        <button class="icon-btn" data-act="prev" aria-label="prev">${icon('chevron-left', 'flip-rtl')}</button>
        <div class="day-title">
          <div class="weekday"></div>
          <div class="hijri accent-text"></div>
          <div class="greg muted"></div>
        </div>
        <button class="icon-btn" data-act="next" aria-label="next">${icon('chevron-right', 'flip-rtl')}</button>
      </header>
      <button class="chip today-chip" data-act="today" hidden>${esc(t('common.today'))}</button>
      <ul class="prayer-list"></ul>
      <footer class="method muted small"><button class="link" data-act="method"></button></footer>
    </section>
  </div>`);
  root.append(el);

  const q = (sel) => el.querySelector(sel);
  q('[data-act=loc]').onclick = () => openLocationDialog({ onPickOnMap: () => go('qibla') });
  q('[data-act=prev]').onclick = () => { offset--; renderDay(); };
  q('[data-act=next]').onclick = () => { offset++; renderDay(); };
  q('[data-act=today]').onclick = () => { offset = 0; renderDay(); };
  q('[data-act=method]').onclick = () => go('settings', 'prayer');

  function renderDay() {
    const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const r = timesForDay(day);
    q('.place span').textContent = s.location.name || `${s.location.lat.toFixed(3)}, ${s.location.lng.toFixed(3)}`;
    q('.weekday').textContent = offset === 0 ? `${fmtWeekday(day)} · ${t('common.today')}` : fmtWeekday(day);
    q('.hijri').textContent = formatHijri(day, document.documentElement.lang, s.hijriOffset);
    q('.greg').textContent = fmtDate(day, 'short');
    q('.today-chip').hidden = offset === 0;
    const ramadan = hijriParts(day, s.hijriOffset).month === 9;
    const list = q('.prayer-list');
    list.innerHTML = '';
    PRAYERS.forEach((p, i) => {
      const mode = s.prayerModes[p] || 'off';
      let name = p === 'dhuhr' && r.isFriday ? t('prayers.jumuah') : t(`prayers.${p}`);
      if (ramadan && p === 'fajr' && document.documentElement.lang !== 'tr') name += ` · ${t('prayer.imsak')}`;
      if (ramadan && p === 'maghrib') name += ` · ${t('prayer.iftar')}`;
      const li = h(`<li class="prayer-row" data-p="${p}" style="--i:${i}">
        <span class="p-name">${esc(name)}</span>
        <span class="p-left muted"></span>
        <span class="p-time">${esc(fmtTime(r.times[p]))}</span>
        <button class="icon-btn mode mode-${mode}" title="${esc(t(MODE_LABEL[mode]))}" aria-label="${esc(t(MODE_LABEL[mode]))}">${icon(MODE_ICON[mode])}</button>
      </li>`);
      li.querySelector('.mode').onclick = () => {
        updateSettings({ prayerModes: { ...s.prayerModes, [p]: MODE_NEXT[mode] } });
        renderDay();
      };
      list.append(li);
    });
    const m = resolveMethod(s, s.location);
    const label = METHODS.find((x) => x.id === m)?.label || m;
    q('.method .link').innerHTML = `${icon('info')} ${esc(t('prayer.method'))}: ${esc(label)} · ${esc(s.madhab === 'hanafi' ? t('settings.hanafi') : t('settings.shafi').split(' (')[0])}`;
    tick();
  }

  function tick() {
    const now = new Date();
    q('.clock-big').textContent = fmtTime(now, { seconds: true });
    const np = nextPrayer(now, s, s.location);
    if (!np) return;
    const today = timesForDay(now);
    // previous prayer (for the progress ring)
    let prev = null;
    for (const p of PRAYERS) if (p !== 'sunrise' && today.times[p] <= now) prev = today.times[p];
    if (!prev) {
      const y = timesForDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      prev = y.times.isha;
    }
    const isFri = np.time.getDay() === 5;
    const name = np.prayer === 'dhuhr' && isFri ? t('prayers.jumuah') : t(`prayers.${np.prayer}`);
    const left = np.time - now;
    q('.next-label').textContent = t('prayer.timeTo', { prayer: name });
    q('.countdown').textContent = fmtDuration(left);
    const frac = Math.min(1, Math.max(0, 1 - left / (np.time - prev)));
    q('.ring-progress .bar').style.strokeDashoffset = String(339.292 * (1 - frac));

    // Highlight rows when looking at today.
    el.querySelectorAll('.prayer-row').forEach((row) => {
      const p = row.dataset.p;
      const isNext = offset === 0 && np.day.toDateString() === now.toDateString() && p === np.prayer;
      row.classList.toggle('next', isNext);
      row.classList.toggle('past', offset < 0 || (offset === 0 && today.times[p] <= now));
      row.querySelector('.p-left').textContent = isNext ? `-${fmtDuration(left)}` : '';
    });

    // Ramadan: iftar countdown / suhoor end.
    const banner = q('.ramadan-banner');
    const hj = hijriParts(now, s.hijriOffset);
    if (hj.month === 9) {
      banner.hidden = false;
      const iftar = today.times.maghrib;
      banner.innerHTML = iftar > now
        ? `${icon('moon-star')} <span>${esc(t('prayer.ramadanDay', { n: hj.day }))}</span><strong>${esc(t('prayer.iftarIn'))} ${esc(fmtDuration(iftar - now))}</strong>`
        : `${icon('moon-star')} <span>${esc(t('prayer.ramadanDay', { n: hj.day }))}</span><strong>${esc(t('prayer.suhoorEnds', { time: fmtTime(timesForDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)).times.fajr) }))}</strong>`;
    } else banner.hidden = true;

    // Midnight: move "today" forward.
    if (offset === 0 && q('.greg').dataset.day && q('.greg').dataset.day !== now.toDateString()) renderDay();
    q('.greg').dataset.day = now.toDateString();
  }

  renderDay();
  const offs = [on('tick', tick), on('settings', renderDay), on('location', renderDay)];
  return { destroy: () => offs.forEach((f) => f()) };
}
