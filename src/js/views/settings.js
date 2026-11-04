import { state, updateSettings, on } from '../store.js';
import { t, LANG_NAMES } from '../i18n.js';
import { METHODS, PRAYERS, autoMethod, countryFromTimeZone } from '../prayer.js';
import { soundLabel } from '../sound.js';
import { h, esc } from '../util.js';
import { icon } from '../icons.js';
import { openLocationDialog } from '../location.js';
import { soundPicker } from './soundpicker.js';

export const ACCENTS = { teal: '#2bb3c0', emerald: '#2fbf71', gold: '#e0a93b', blue: '#4c8dff', violet: '#9b7bff', rose: '#ef6f8e' };

const segmented = (name, options, value) => `<div class="segmented" role="radiogroup" data-name="${name}">${options.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === value}" class="${v === value ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
const toggle = (name, checked) => `<label class="switch"><input type="checkbox" data-name="${name}" ${checked ? 'checked' : ''}><span></span></label>`;
const row = (title, hint, control, extra = '') => `<div class="set-row ${extra}"><div class="set-text"><div class="set-title">${esc(title)}</div>${hint ? `<div class="set-hint muted small">${esc(hint)}</div>` : ''}</div><div class="set-control">${control}</div></div>`;

export function settingsView(root, { go, section }) {
  const s = state.settings;
  let quiet = false;
  const sections = [
    ['general', 'palette', t('settings.general')],
    ['startup', 'power', t('settings.startup')],
    ['location', 'map-pin', t('settings.location')],
    ['prayer', 'moon-star', t('settings.prayer')],
    ['azan', 'volume-2', t('settings.azan')],
    ['about', 'info', t('settings.about')],
  ];
  const el = h(`<div class="settings-layout">
    <nav class="settings-nav">${sections.map(([id, ic, label]) => `<a href="#" data-sec="${id}">${icon(ic)}<span>${esc(label)}</span></a>`).join('')}</nav>
    <div class="settings-body"></div>
  </div>`);
  root.append(el);
  const body = el.querySelector('.settings-body');

  function render() {
    const autoId = autoMethod(s.location?.country || countryFromTimeZone());
    const autoLabel = METHODS.find((m) => m.id === autoId)?.label;
    body.innerHTML = `
      <section class="card set-card" id="sec-general" style="--i:0">
        <h2>${icon('palette')} ${esc(t('settings.general'))}</h2>
        ${row(t('settings.language'), '', segmented('lang', Object.entries(LANG_NAMES), s.lang))}
        ${row(t('settings.theme'), '', segmented('theme', [['dark', t('settings.dark')], ['light', t('settings.light')], ['system', t('settings.system')]], s.theme))}
        ${row(t('settings.accent'), '', `<div class="swatches">${Object.entries(ACCENTS).map(([k, c]) => `<button type="button" class="swatch ${s.accent === k ? 'on' : ''}" data-accent="${k}" style="--c:${c}" title="${k}" aria-label="${k}"></button>`).join('')}</div>`)}
        ${row(t('settings.animations'), t('settings.animationsHint'), toggle('animations', s.animations))}
        ${row(t('settings.timeFormat'), '', segmented('timeFormat', [['24', t('settings.h24')], ['12', t('settings.h12')]], s.timeFormat))}
      </section>
      <section class="card set-card" id="sec-startup" style="--i:1">
        <h2>${icon('power')} ${esc(t('settings.startup'))}</h2>
        ${row(t('settings.startAtLogin'), t('settings.startAtLoginHint'), toggle('startAtLogin', s.startAtLogin))}
        ${row(t('settings.startHidden'), '', toggle('startHidden', s.startHidden))}
        ${row(t('settings.closeToTray'), '', toggle('closeToTray', s.closeToTray))}
      </section>
      <section class="card set-card" id="sec-location" style="--i:2">
        <h2>${icon('map-pin')} ${esc(t('settings.location'))}</h2>
        ${row(t('settings.current'), s.location ? `${t('location.coords')}: ${s.location.lat.toFixed(5)}, ${s.location.lng.toFixed(5)}` : '',
          `<div class="row gap"><strong>${esc(s.location?.name || t('settings.notSet'))}</strong><button class="btn small" data-act="loc">${icon('search')} ${esc(t('settings.change'))}</button><button class="btn small" data-act="map">${icon('map')}</button></div>`)}
      </section>
      <section class="card set-card" id="sec-prayer" style="--i:3">
        <h2>${icon('moon-star')} ${esc(t('settings.prayer'))}</h2>
        ${row(t('settings.method'), '', `<select data-name="method"><option value="auto">${esc(t('settings.methodAuto', { method: autoLabel }))}</option>${METHODS.map((m) => `<option value="${m.id}" ${s.method === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>`)}
        ${row(t('settings.madhab'), '', segmented('madhab', [['shafi', t('settings.shafi')], ['hanafi', t('settings.hanafi')]], s.madhab), 'stack')}
        ${row(t('settings.highLat'), '', `<select data-name="highLatitude">${[['auto', 'hlAuto'], ['middle', 'hlMiddle'], ['seventh', 'hlSeventh'], ['angle', 'hlAngle']].map(([v, k]) => `<option value="${v}" ${s.highLatitude === v ? 'selected' : ''}>${esc(t('settings.' + k))}</option>`).join('')}</select>`)}
        ${row(t('settings.adjust'), t('settings.adjustHint'), `<div class="adjust-grid">${PRAYERS.map((p) => `<label class="adj"><span>${esc(t('prayers.' + p))}</span><span class="stepper"><button type="button" data-adj="${p}" data-d="-1">−</button><output>${s.adjust[p] > 0 ? '+' : ''}${s.adjust[p]}</output><button type="button" data-adj="${p}" data-d="1">+</button></span></label>`).join('')}</div>`, 'stack')}
        ${row(t('settings.hijriOffset'), t('settings.hijriHint'), `<span class="stepper"><button type="button" data-hijri="-1">−</button><output>${s.hijriOffset > 0 ? '+' : ''}${s.hijriOffset}</output><button type="button" data-hijri="1">+</button></span>`)}
      </section>
      <section class="card set-card" id="sec-azan" style="--i:4">
        <h2>${icon('volume-2')} ${esc(t('settings.azan'))}</h2>
        ${row(t('settings.voice'), soundLabel(s.azanSound), '<div class="sp-azan"></div>', 'stack')}
        ${row(t('settings.fajrVoice'), soundLabel(s.fajrSound), '<div class="sp-fajr"></div>', 'stack')}
        ${row(t('settings.length'), '', segmented('azanLength', [['short', t('settings.short')], ['full', t('settings.full')]], s.azanLength))}
        ${row(t('settings.volume'), '', `<input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-name="volume">`)}
        ${row(t('settings.reminder'), '', `<select data-name="reminderMin">${[0, 5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${s.reminderMin === n ? 'selected' : ''}>${n ? `${n} ${t('common.minShort')}` : t('settings.reminderOff')}</option>`).join('')}</select>`)}
        ${row(t('settings.showOnAzan'), '', toggle('showOnAzan', s.showOnAzan))}
      </section>
      <section class="card set-card" id="sec-about" style="--i:5">
        <h2>${icon('info')} ${esc(t('settings.about'))}</h2>
        <div class="about"><img src="assets/icon.png" alt="" width="56" height="56"><div><strong>SA3A · ساعة</strong><div class="muted small app-version"></div></div></div>
        <p class="muted small">${esc(t('settings.credits'))}</p>
        <button class="btn danger ghost" data-act="quit">${icon('power')} ${esc(t('settings.quit'))}</button>
      </section>`;

    // Segmented controls
    body.querySelectorAll('.segmented').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => {
        b.onclick = () => updateSettings({ [seg.dataset.name]: b.dataset.v });
      });
    });
    body.querySelectorAll('input[type=checkbox][data-name]').forEach((c) => {
      c.onchange = async () => {
        const name = c.dataset.name;
        if (name === 'startAtLogin') await window.sa3a.setOpenAtLogin(c.checked);
        updateSettings({ [name]: c.checked });
      };
    });
    body.querySelectorAll('select[data-name]').forEach((sel) => {
      sel.onchange = () => updateSettings({ [sel.dataset.name]: sel.dataset.name === 'reminderMin' ? +sel.value : sel.value });
    });
    body.querySelector('[data-name=volume]').onchange = (e) => updateSettings({ volume: +e.target.value });
    body.querySelectorAll('.swatch').forEach((b) => { b.onclick = () => updateSettings({ accent: b.dataset.accent }); });
    body.querySelectorAll('[data-adj]').forEach((b) => {
      b.onclick = () => {
        const p = b.dataset.adj;
        const v = Math.max(-30, Math.min(30, (s.adjust[p] || 0) + +b.dataset.d));
        updateSettings({ adjust: { ...s.adjust, [p]: v } });
      };
    });
    body.querySelectorAll('[data-hijri]').forEach((b) => {
      b.onclick = () => updateSettings({ hijriOffset: Math.max(-2, Math.min(2, s.hijriOffset + +b.dataset.hijri)) });
    });
    body.querySelector('[data-act=loc]').onclick = () => openLocationDialog({ onPickOnMap: () => go('qibla') });
    body.querySelector('[data-act=map]').onclick = () => go('qibla');
    body.querySelector('[data-act=quit]').onclick = () => window.sa3a.quit();

    const saveSound = (key) => (value) => { quiet = true; updateSettings({ [key]: value }); };
    body.querySelector('.sp-azan').append(soundPicker(s.azanSound, { onChange: saveSound('azanSound') }).el);
    body.querySelector('.sp-fajr').append(soundPicker(s.fajrSound, { fajr: true, onChange: saveSound('fajrSound') }).el);
    window.sa3a.appInfo().then((i) => { const v = body.querySelector('.app-version'); if (v) v.textContent = t('settings.version', { v: i.version }); });
  }

  el.querySelectorAll('.settings-nav a').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      body.querySelector(`#sec-${a.dataset.sec}`)?.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth', block: 'start' });
    };
  });

  render();
  if (section) setTimeout(() => body.querySelector(`#sec-${section}`)?.scrollIntoView({ block: 'start' }), 50);
  // Re-render on changes, except those coming from the sound pickers (keeps focus while typing a YouTube link).
  const keep = () => { if (quiet) { quiet = false; return; } const y = root.scrollTop; render(); root.scrollTop = y; };
  const offs = [on('settings', keep), on('location', keep)];
  return { destroy: () => offs.forEach((f) => f()) };
}
