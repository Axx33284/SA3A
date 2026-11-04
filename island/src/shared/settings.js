// Settings schema, defaults and validation. Shared by the main process, both windows and the tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IslandSettings = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const POSITIONS = ['top-center', 'top-left', 'top-right', 'bottom-center', 'bottom-left', 'bottom-right'];
  const THEMES = ['black', 'graphite', 'glass', 'light'];
  const IDLE_STYLES = ['pill', 'clock', 'dot', 'hidden'];
  const EXPAND_ON = ['hover', 'click'];
  const ANIMATIONS = ['spring', 'smooth', 'reduced'];
  const FEATURES = ['media', 'notifications', 'timers', 'volume', 'battery', 'devices', 'privacy'];

  const DEFAULTS = Object.freeze({
    position: 'top-center',
    display: 'primary',          // 'primary' | 'cursor' | a display id
    offsetX: 0,                  // px, horizontal nudge
    offsetY: 10,                 // px from the screen edge
    scale: 1,                    // 0.7 – 1.6
    idleWidth: 126,              // px, width of the resting pill
    idleStyle: 'pill',
    theme: 'black',
    accent: '#0a84ff',
    glow: true,                  // tint with album-art colour
    visualizer: true,
    animation: 'spring',
    expandOn: 'hover',
    hoverDelay: 250,             // ms
    collapseDelay: 450,          // ms
    notificationDuration: 6,     // seconds a banner stays open
    showNotificationBody: true,  // off = privacy mode (title only)
    groupByApp: true,
    hideInFullscreen: true,
    dnd: false,                  // pause banners (they are still listed)
    mutedApps: [],               // app ids whose notifications are ignored
    knownApps: {},               // app id -> name, filled as notifications arrive
    timerSound: true,
    startWithWindows: true,
    pausedMediaTimeout: 10,      // minutes a paused player stays in the island
    features: { media: true, notifications: true, timers: true, volume: true, battery: true, devices: true, privacy: true },
    onboarded: false
  });

  function clamp(n, lo, hi, dflt) {
    n = Number(n);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  }

  function oneOf(v, list, dflt) { return list.includes(v) ? v : dflt; }

  function isColor(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c); }

  // Returns a complete, valid settings object from anything (old file, partial patch, garbage).
  function normalize(input) {
    const s = input && typeof input === 'object' ? input : {};
    const out = {};
    out.position = oneOf(s.position, POSITIONS, DEFAULTS.position);
    out.display = (typeof s.display === 'string' || typeof s.display === 'number') && s.display !== '' ? String(s.display) : DEFAULTS.display;
    out.offsetX = Math.round(clamp(s.offsetX, -2000, 2000, DEFAULTS.offsetX));
    out.offsetY = Math.round(clamp(s.offsetY, 0, 400, DEFAULTS.offsetY));
    out.scale = Math.round(clamp(s.scale, 0.7, 1.6, DEFAULTS.scale) * 100) / 100;
    out.idleWidth = Math.round(clamp(s.idleWidth, 60, 260, DEFAULTS.idleWidth));
    out.idleStyle = oneOf(s.idleStyle, IDLE_STYLES, DEFAULTS.idleStyle);
    out.theme = oneOf(s.theme, THEMES, DEFAULTS.theme);
    out.accent = isColor(s.accent) ? s.accent.toLowerCase() : DEFAULTS.accent;
    out.glow = typeof s.glow === 'boolean' ? s.glow : DEFAULTS.glow;
    out.visualizer = typeof s.visualizer === 'boolean' ? s.visualizer : DEFAULTS.visualizer;
    out.animation = oneOf(s.animation, ANIMATIONS, DEFAULTS.animation);
    out.expandOn = oneOf(s.expandOn, EXPAND_ON, DEFAULTS.expandOn);
    out.hoverDelay = Math.round(clamp(s.hoverDelay, 0, 2000, DEFAULTS.hoverDelay));
    out.collapseDelay = Math.round(clamp(s.collapseDelay, 0, 3000, DEFAULTS.collapseDelay));
    out.notificationDuration = Math.round(clamp(s.notificationDuration, 2, 30, DEFAULTS.notificationDuration));
    for (const k of ['showNotificationBody', 'groupByApp', 'hideInFullscreen', 'dnd', 'timerSound', 'startWithWindows', 'onboarded']) {
      out[k] = typeof s[k] === 'boolean' ? s[k] : DEFAULTS[k];
    }
    out.pausedMediaTimeout = Math.round(clamp(s.pausedMediaTimeout, 0, 240, DEFAULTS.pausedMediaTimeout));
    out.mutedApps = Array.isArray(s.mutedApps) ? [...new Set(s.mutedApps.filter(a => typeof a === 'string' && a))] : [];
    out.knownApps = {};
    if (s.knownApps && typeof s.knownApps === 'object') {
      const entries = Object.entries(s.knownApps).filter(([k, v]) => k && typeof v === 'string').slice(-200);
      for (const [k, v] of entries) out.knownApps[k] = v.slice(0, 80);
    }
    out.features = {};
    const f = s.features && typeof s.features === 'object' ? s.features : {};
    for (const k of FEATURES) out.features[k] = typeof f[k] === 'boolean' ? f[k] : DEFAULTS.features[k];
    return out;
  }

  // Applies a patch (possibly nested for `features`) and validates the result.
  function merge(current, patch) {
    const base = normalize(current);
    if (!patch || typeof patch !== 'object') return base;
    const next = Object.assign({}, base, patch);
    if (patch.features) next.features = Object.assign({}, base.features, patch.features);
    if (patch.knownApps) next.knownApps = Object.assign({}, base.knownApps, patch.knownApps);
    return normalize(next);
  }

  return { DEFAULTS, POSITIONS, THEMES, IDLE_STYLES, EXPAND_ON, ANIMATIONS, FEATURES, normalize, merge };
});
