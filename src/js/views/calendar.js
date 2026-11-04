import { state, on } from '../store.js';
import { t, lang } from '../i18n.js';
import { hijriParts, formatHijri, upcomingEvents, EVENTS } from '../prayer.js';
import { h, esc, fmtDate } from '../util.js';
import { icon } from '../icons.js';

export function calendarView(root) {
  let monthOffset = 0;
  const el = h(`<div class="calendar-layout">
    <section class="card cal-card">
      <header class="cal-head">
        <button class="icon-btn" data-act="prev">${icon('chevron-left', 'flip-rtl')}</button>
        <div class="cal-title"><div class="cal-month"></div><div class="cal-hijri accent-text small"></div></div>
        <button class="icon-btn" data-act="next">${icon('chevron-right', 'flip-rtl')}</button>
      </header>
      <div class="cal-grid"></div>
      <p class="muted small note">${icon('info')} ${esc(t('calendar.note'))}</p>
    </section>
    <section class="card events-card">
      <h2>${esc(t('calendar.upcoming'))}</h2>
      <ul class="events"></ul>
    </section>
  </div>`);
  root.append(el);
  el.querySelector('[data-act=prev]').onclick = () => { monthOffset--; renderMonth(); };
  el.querySelector('[data-act=next]').onclick = () => { monthOffset++; renderMonth(); };

  const eventKey = (m, d) => EVENTS.find((e) => e.month === m && e.day === d);

  function renderMonth() {
    const off = state.settings.hijriOffset;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    el.querySelector('.cal-month').textContent = new Intl.DateTimeFormat(lang(), { month: 'long', year: 'numeric', numberingSystem: 'latn' }).format(first);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    el.querySelector('.cal-hijri').textContent = `${formatHijri(first, lang(), off)} – ${formatHijri(last, lang(), off)}`;
    const grid = el.querySelector('.cal-grid');
    grid.innerHTML = '';
    const weekStart = lang() === 'ar' ? 6 : 1; // Saturday-first for Arabic, Monday-first otherwise
    const names = t('weekdaysShort');
    for (let i = 0; i < 7; i++) grid.append(h(`<div class="cal-dow muted small">${esc(names[(weekStart + i) % 7])}</div>`));
    const lead = (first.getDay() - weekStart + 7) % 7;
    for (let i = 0; i < lead; i++) grid.append(h('<div class="cal-cell blank"></div>'));
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(first.getFullYear(), first.getMonth(), d);
      const hp = hijriParts(date, off);
      const ev = eventKey(hp.month, hp.day);
      const isToday = date.toDateString() === now.toDateString();
      const cell = h(`<div class="cal-cell ${isToday ? 'today' : ''} ${ev ? 'event' : ''} ${hp.month === 9 ? 'ramadan' : ''}" title="${esc(formatHijri(date, lang(), off))}${ev ? ' · ' + esc(t('calendar.events.' + ev.id)) : ''}">
        <span class="g">${d}</span><span class="hd">${hp.day}</span>${ev ? '<span class="dot"></span>' : ''}</div>`);
      grid.append(cell);
    }
  }

  function renderEvents() {
    const list = el.querySelector('.events');
    list.innerHTML = '';
    upcomingEvents(new Date(), state.settings.hijriOffset).forEach((e, i) => {
      const when = e.inDays === 0 ? t('calendar.today') : e.inDays === 1 ? t('calendar.tomorrow') : t('calendar.inDays', { n: e.inDays });
      list.append(h(`<li class="event-row ${e.inDays === 0 ? 'now' : ''}" style="--i:${i}">
        <div class="ev-badge">${icon(['ramadan', 'qadr'].includes(e.id) ? 'moon-star' : e.id.startsWith('eid') ? 'sparkles' : 'calendar-days')}</div>
        <div class="ev-main"><strong>${esc(t('calendar.events.' + e.id))}</strong>
          <span class="muted small">${esc(fmtDate(e.date, 'long'))} · ${esc(formatHijri(e.date, lang(), state.settings.hijriOffset))}</span></div>
        <div class="ev-when accent-text">${esc(when)}</div>
      </li>`));
    });
  }

  renderMonth();
  renderEvents();
  return { destroy: on('settings', () => { renderMonth(); renderEvents(); }) };
}
