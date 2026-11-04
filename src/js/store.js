// App state, persisted by the main process to %APPDATA%\SA3A\sa3a-data.json.
import { detectLang } from './i18n.js';

// When the UI is opened in a plain browser (development/screenshots) there is no Electron bridge: use localStorage.
if (!window.sa3a) {
  const KEY = 'sa3a-dev-data';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  window.sa3a = {
    loadData: read,
    save: async (k, v) => { const d = read(); d[k] = v; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } },
    setOpenAtLogin: async (v) => v, getOpenAtLogin: async () => false, showWindow: async () => {}, flashWindow: async () => {},
    updateTray: async () => {}, notify: async ({ title, body }) => console.info('[notify]', title, body),
    pickAudioFile: async () => null, openExternal: async (u) => window.open(u), appInfo: async () => ({ version: 'dev', packaged: false }),
    quit: async () => {}, onResume: () => {}, onSystemTheme: () => {},
  };
}

export const DEFAULT_SETTINGS = {
  lang: detectLang(),
  theme: 'dark',
  accent: 'teal',
  animations: !matchMedia('(prefers-reduced-motion: reduce)').matches, // follows Windows "Animation effects"
  timeFormat: '24',
  startAtLogin: true,
  startHidden: true,
  closeToTray: true,
  method: 'auto',
  madhab: 'shafi',
  highLatitude: 'auto',
  adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  hijriOffset: 0,
  prayerModes: { fajr: 'sound', sunrise: 'off', dhuhr: 'sound', asr: 'sound', maghrib: 'sound', isha: 'sound' },
  azanSound: { kind: 'azan', id: 'makkah' },
  fajrSound: { kind: 'azan', id: 'makkah-fajr' },
  azanLength: 'short',
  volume: 0.9,
  reminderMin: 0,
  showOnAzan: false,
  location: null, // { lat, lng, name, country }
  firstRunDone: false,
};

const raw = window.sa3a.loadData() || {};

export const state = {
  settings: {
    ...DEFAULT_SETTINGS,
    ...(raw.settings || {}),
    adjust: { ...DEFAULT_SETTINGS.adjust, ...(raw.settings?.adjust || {}) },
    prayerModes: { ...DEFAULT_SETTINGS.prayerModes, ...(raw.settings?.prayerModes || {}) },
  },
  alarms: Array.isArray(raw.alarms) ? raw.alarms : [],
  timers: Array.isArray(raw.timers) ? raw.timers : [],
  stopwatch: raw.stopwatch || { running: false, startedAt: 0, elapsed: 0, laps: [] },
  clocks: Array.isArray(raw.clocks) ? raw.clocks : ['Asia/Riyadh', 'Europe/Istanbul', 'Europe/London'],
};

export function save(key) {
  window.sa3a.save(key, JSON.parse(JSON.stringify(state[key])));
}

// Tiny event bus: 'tick' (every second), 'settings', 'location', 'alarms', 'timers'.
const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt)?.delete(fn);
}
export function emit(evt, payload) {
  listeners.get(evt)?.forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  save('settings');
  emit('settings', patch);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
