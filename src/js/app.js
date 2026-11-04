import { state, on, updateSettings } from './store.js';
import { setLang, t } from './i18n.js';
import { $, h, esc, clearFormatCache, fmtTime } from './util.js';
import { icon } from './icons.js';
import { startScheduler } from './scheduler.js';
import { nextPrayer } from './prayer.js';
import { prayerView } from './views/prayer.js';
import { calendarView } from './views/calendar.js';
import { qiblaView } from './views/qibla.js';
import { alarmsView } from './views/alarms.js';
import { timersView } from './views/timers.js';
import { stopwatchView } from './views/stopwatch.js';
import { worldclockView } from './views/worldclock.js';
import { settingsView, ACCENTS } from './views/settings.js';

const ROUTES = [
  { id: 'prayer', icon: 'moon-star', view: prayerView },
  { id: 'calendar', icon: 'calendar-days', view: calendarView },
  { id: 'qibla', icon: 'compass', view: qiblaView },
  { id: 'alarms', icon: 'alarm-clock', view: alarmsView, group: 'clock' },
  { id: 'timers', icon: 'hourglass', view: timersView, group: 'clock' },
  { id: 'stopwatch', icon: 'timer', view: stopwatchView, group: 'clock' },
  { id: 'worldclock', icon: 'globe', view: worldclockView, group: 'clock' },
];

let current = null; // { id, instance, el }
let navToken = 0;

function applyAppearance() {
  const s = state.settings;
  setLang(s.lang);
  clearFormatCache();
  const dark = s.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : s.theme !== 'light';
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.motion = s.animations ? 'on' : 'off';
  root.style.setProperty('--accent', ACCENTS[s.accent] || ACCENTS.teal);
  document.title = t('appName');
}

function renderShell() {
  const app = $('#app');
  app.innerHTML = '';
  const nav = h(`<aside class="sidebar">
    <div class="brand drag"><img src="assets/icon.png" alt="" width="30" height="30"><div><strong>SA3A</strong><span class="muted tiny">ساعة</span></div></div>
    <nav class="nav">
      ${ROUTES.map((r, i) => `${r.group && !ROUTES[i - 1]?.group ? '<div class="nav-sep"></div>' : ''}<button class="nav-item" data-route="${r.id}">${icon(r.icon)}<span>${esc(t('nav.' + r.id))}</span></button>`).join('')}
    </nav>
    <div class="nav-bottom"><button class="nav-item" data-route="settings">${icon('settings')}<span>${esc(t('nav.settings'))}</span></button></div>
    <span class="nav-indicator" aria-hidden="true"></span>
  </aside>`);
  const main = h(`<main class="main">
    <header class="topbar drag"><h1 class="page-title"></h1><div class="top-clock muted"></div></header>
    <div class="view-host"></div>
  </main>`);
  app.append(nav, main);
  nav.querySelectorAll('[data-route]').forEach((b) => { b.onclick = () => go(b.dataset.route); });
}

function moveIndicator(id) {
  const btn = document.querySelector(`.nav-item[data-route="${id}"]`);
  const ind = document.querySelector('.nav-indicator');
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
  if (!btn || !ind) return;
  ind.style.transform = `translateY(${btn.offsetTop + btn.offsetHeight / 2 - 12}px)`;
  ind.style.opacity = '1';
}

export function go(id, section) {
  const route = id === 'settings' ? { id: 'settings', view: settingsView } : ROUTES.find((r) => r.id === id) || ROUTES[0];
  const host = $('.view-host');
  const token = ++navToken;
  const motion = document.documentElement.dataset.motion !== 'off';
  const old = current;

  const mount = () => {
    if (token !== navToken) return;
    if (old) { try { old.instance?.destroy?.(); } catch (e) { console.error(e); } old.el.remove(); }
    const el = h(`<div class="view view-${route.id}"></div>`);
    host.append(el);
    $('.page-title').textContent = t('nav.' + route.id);
    current = { id: route.id, el, instance: null };
    current.instance = route.view(el, { go, section }) || {};
    if (motion) {
      el.classList.add('enter');
      el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
    }
    host.scrollTop = 0;
  };
  moveIndicator(route.id);
  if (old && motion) {
    old.el.classList.add('leave');
    setTimeout(mount, 140);
  } else mount();
}

function rerenderAll() {
  const id = current?.id || 'prayer';
  applyAppearance();
  renderShell();
  current = null;
  go(id);
  updateTray();
}

function updateTray() {
  const s = state.settings;
  let tip = 'SA3A';
  if (s.location) {
    const np = nextPrayer(new Date(), s, s.location);
    if (np) tip = `SA3A · ${t('tray.next', { prayer: t('prayers.' + np.prayer), time: fmtTime(np.time) })}`;
  }
  window.sa3a.updateTray(tip, { open: t('tray.open'), quit: t('tray.quit') });
}

async function firstRun() {
  const s = state.settings;
  if (s.firstRunDone) return;
  // Start with Windows is on by default so azan and alarms work after a reboot.
  if (s.startAtLogin) await window.sa3a.setOpenAtLogin(true);
  updateSettings({ firstRunDone: true });
}

function boot() {
  applyAppearance();
  renderShell();
  go('prayer');
  startScheduler();
  firstRun();
  updateTray();

  on('settings', (patch) => {
    if (!patch) return;
    const visual = ['lang', 'theme', 'timeFormat'].some((k) => k in patch);
    if (visual) rerenderAll();
    else applyAppearance();
    if ('location' in patch || 'method' in patch) updateTray();
  });
  on('location', updateTray);
  on('tick', (now) => {
    const tc = $('.top-clock');
    if (tc) tc.textContent = fmtTime(new Date(now), { seconds: true });
    if (now % 60000 < 1000) updateTray();
  });
  window.sa3a.onSystemTheme(() => { if (state.settings.theme === 'system') rerenderAll(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.settings.theme === 'system') rerenderAll(); });
  window.addEventListener('resize', () => current && moveIndicator(current.id));
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && /^[1-8]$/.test(e.key)) {
      const ids = [...ROUTES.map((r) => r.id), 'settings'];
      go(ids[+e.key - 1]);
    }
  });
}

boot();
