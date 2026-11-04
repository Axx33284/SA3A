/* global ICONS, IslandSettings, IslandCore */
// The island window: renders live activities and morphs between idle, compact,
// alert, notification and expanded views.
(function () {
  'use strict';
  const api = window.winisland;
  const Core = IslandCore;
  const $ = id => document.getElementById(id);
  const islandEl = $('island');
  const bubbleEl = $('bubble');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls) => `<span class="glyph ${cls || ''}">${ICONS[name] || ICONS.app}</span>`;
  const params = new URLSearchParams(location.search);

  // ---------------- State ----------------
  const S = {
    settings: IslandSettings.normalize({}),
    sessions: [], currentId: null, preferredSession: null, lastActive: {},
    thumbs: {}, colors: {},
    history: [], unread: 0,
    power: null, privacy: { mic: [], cam: [] }, volume: null,
    timers: [], stopwatch: { running: false, startedAt: 0, elapsed: 0, laps: [] },
    alerts: [], alert: null,
    hover: false, expanded: false, tab: null, detail: false,
    drag: null, ready: false, lastTrackKey: null
  };

  function loadLocal() {
    try {
      const t = JSON.parse(localStorage.getItem('timers') || '[]');
      if (Array.isArray(t)) S.timers = t.filter(x => x && (x.pausedLeft != null || x.endsAt > Date.now() - 60000));
      const sw = JSON.parse(localStorage.getItem('stopwatch') || 'null');
      if (sw && typeof sw === 'object') S.stopwatch = Object.assign(S.stopwatch, sw);
    } catch { /* ignore */ }
  }
  function saveLocal() {
    try { localStorage.setItem('timers', JSON.stringify(S.timers)); localStorage.setItem('stopwatch', JSON.stringify(S.stopwatch)); } catch { }
  }

  // ---------------- Helpers ----------------
  const now = () => Date.now();
  const media = () => Core.pickSession(S.sessions, S.currentId, S.preferredSession);
  const thumbOf = s => (s && s.thumb && S.thumbs[s.thumb]) || null;
  function command(cmd) { api && api.send('island:command', cmd); }
  function mediaCmd(action, extra) { const m = media(); command(Object.assign({ cmd: 'media', id: m ? m.id : '', action }, extra || {})); }

  function appBadge(appId, name, size) {
    const a = Core.appInfo(appId, name);
    return `<span class="app-badge" style="background:${a.color};${size ? `width:${size}px;height:${size}px` : ''}">${ICONS[a.glyph] || ICONS.app}</span>`;
  }

  function notifIconHtml(n) {
    if (n.icon) return { cls: 'n-icon img', html: `<img src="${esc(n.icon)}" alt="">`, style: '' };
    const a = Core.appInfo(n.appId, n.app);
    return { cls: 'n-icon', html: ICONS[a.glyph] || ICONS.app, style: `background:${a.color}` };
  }

  // Album-art colour for the glow and waveform (average of saturated pixels).
  function artColor(key, src) {
    if (!src || S.colors[key] !== undefined) return;
    S.colors[key] = null;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
        const d = g.getImageData(0, 0, 24, 24).data;
        let r = 0, gg = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          const wt = 0.05 + sat * sat * (mx / 255);
          r += d[i] * wt; gg += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
        }
        if (w > 0) {
          let R = r / w, G = gg / w, B = b / w;
          const mx = Math.max(R, G, B);
          if (mx < 150) { const k = 150 / Math.max(mx, 1); R *= k; G *= k; B *= k; } // keep it bright enough on black
          S.colors[key] = `rgb(${Math.min(255, R | 0)},${Math.min(255, G | 0)},${Math.min(255, B | 0)})`;
          render();
        }
      } catch { /* ignore */ }
    };
    img.src = src;
  }

  // ---------------- Alerts (temporary takeovers) ----------------
  function pushAlert(a) {
    a.id = a.id || Math.random().toString(36).slice(2);
    a.duration = a.duration || 2500;
    // A newer alert of the same kind replaces the queued/current one (volume, battery …)
    if (a.replace) {
      if (S.alert && S.alert.kind === a.kind) { S.alert = Object.assign(S.alert, a, { until: now() + a.duration }); render(); return; }
      S.alerts = S.alerts.filter(x => x.kind !== a.kind);
    }
    S.alerts.push(a);
    S.alerts.sort((x, y) => (y.priority || 0) - (x.priority || 0));
    if (!S.alert) nextAlert();
    else render();
  }

  function nextAlert() {
    S.alert = S.alerts.shift() || null;
    S.detail = false;
    if (S.alert) {
      S.alert.until = S.hover && S.alert.kind === 'notif' ? Infinity : now() + S.alert.duration;
      if (S.alert.kind === 'notif' && S.hover) S.detail = true;
      islandEl.classList.remove('bump'); void islandEl.offsetWidth; islandEl.classList.add('bump');
    }
    render();
  }

  function endAlert(id) {
    if (S.alert && (!id || S.alert.id === id)) { stopChime(); nextAlert(); }
    else S.alerts = S.alerts.filter(a => a.id !== id);
  }

  // ---------------- Timers / stopwatch ----------------
  function startTimer(minutes, label) {
    const ms = Math.round(minutes * 60000);
    S.timers.push({ id: Math.random().toString(36).slice(2), endsAt: now() + ms, total: ms, label: label || formatDur(ms) + ' timer' });
    saveLocal(); render();
  }
  function formatDur(ms) {
    const m = Math.round(ms / 60000);
    return m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`) : `${m} min`;
  }
  function timerAction(id, act) {
    const t = S.timers.find(x => x.id === id);
    if (!t) return;
    if (act === 'pause' && t.pausedLeft == null) t.pausedLeft = Math.max(0, t.endsAt - now());
    else if (act === 'resume' && t.pausedLeft != null) { t.endsAt = now() + t.pausedLeft; t.pausedLeft = null; }
    else if (act === 'add') { if (t.pausedLeft != null) t.pausedLeft += 60000; else t.endsAt += 60000; t.total += 60000; }
    else if (act === 'cancel') S.timers = S.timers.filter(x => x.id !== id);
    saveLocal(); render();
  }
  function stopwatch(act) {
    const sw = S.stopwatch;
    if (act === 'toggle') act = sw.running ? 'pause' : 'start';
    if (act === 'start' && !sw.running) { sw.running = true; sw.startedAt = now(); }
    else if (act === 'pause' && sw.running) { sw.elapsed += now() - sw.startedAt; sw.running = false; }
    else if (act === 'lap' && sw.running) { sw.laps.unshift(Core.stopwatchElapsed(sw, now())); sw.laps = sw.laps.slice(0, 20); }
    else if (act === 'reset') { sw.running = false; sw.elapsed = 0; sw.laps = []; }
    saveLocal(); render();
  }
  function checkTimers() {
    const t = now();
    const done = S.timers.filter(x => x.pausedLeft == null && x.endsAt <= t);
    if (!done.length) return;
    S.timers = S.timers.filter(x => !done.includes(x));
    saveLocal();
    for (const d of done) {
      pushAlert({ kind: 'timer-done', big: true, duration: 30000, priority: 5, data: d });
      if (S.settings.timerSound) startChime();
    }
  }

  // Timer chime with Web Audio (no sound files needed).
  let chime = null, audioCtx = null;
  function startChime() {
    stopChime();
    const play = () => {
      try {
        audioCtx = audioCtx || new AudioContext();
        const t0 = audioCtx.currentTime;
        [880, 1174.7, 1568].forEach((f, i) => {
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, t0 + i * 0.16);
          g.gain.linearRampToValueAtTime(0.18, t0 + i * 0.16 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.16 + 0.7);
          o.connect(g).connect(audioCtx.destination);
          o.start(t0 + i * 0.16); o.stop(t0 + i * 0.16 + 0.75);
        });
      } catch { /* ignore */ }
    };
    play();
    let n = 0;
    chime = setInterval(() => { if (++n > 12) stopChime(); else play(); }, 2200);
  }
  function stopChime() { if (chime) { clearInterval(chime); chime = null; } }

  // ---------------- Incoming events ----------------
  function onEvent(m) {
    switch (m.type) {
      case 'media': onMedia(m); break;
      case 'thumb': S.thumbs[m.key] = m.data; render(); break;
      case 'notification': onNotification(m); break;
      case 'notification-history':
        S.history = dedupe((m.items || []).concat(S.history)); render(); break;
      case 'notification-removed':
        S.history = S.history.filter(n => n.id !== m.id);
        if (S.alert && S.alert.kind === 'notif' && S.alert.data.id === m.id) endAlert();
        render(); break;
      case 'power': onPower(m); break;
      case 'volume': onVolume(m); break;
      case 'privacy': onPrivacy(m); break;
    }
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter(n => n && !seen.has(n.id) && seen.add(n.id)).slice(-60);
  }

  function onMedia(m) {
    const t = now();
    S.currentId = m.current;
    S.sessions = (m.sessions || []).map(s => {
      s.receivedAt = t;
      if (s.status === 'playing' || !S.lastActive[s.id]) S.lastActive[s.id] = t;
      s.lastActive = S.lastActive[s.id];
      return s;
    });
    const cur = media();
    if (cur) {
      const key = cur.id + '|' + cur.title + '|' + cur.artist;
      // New track started while the island is collapsed: show it briefly (like a song change on iPhone).
      if (S.ready && S.lastTrackKey && key !== S.lastTrackKey && cur.status === 'playing' && !S.expanded && S.settings.features.media) {
        pushAlert({ kind: 'track', duration: 3200, replace: true, data: { id: cur.id } });
      }
      S.lastTrackKey = key;
    }
    render();
  }

  function onNotification(n) {
    S.history = dedupe(S.history.concat([n]));
    if (!Core.shouldBanner(n, S.settings)) { render(); return; }
    S.unread++;
    const cur = S.alert;
    if (S.settings.groupByApp && cur && cur.kind === 'notif' && cur.data.appId === n.appId) {
      cur.count = (cur.count || 1) + 1; cur.data = n;
      cur.until = S.hover ? Infinity : now() + S.settings.notificationDuration * 1000;
      islandEl.classList.remove('bump'); void islandEl.offsetWidth; islandEl.classList.add('bump');
      render(); return;
    }
    pushAlert({ kind: 'notif', data: n, duration: S.settings.notificationDuration * 1000, priority: 3 });
  }

  function onPower(p) {
    const prev = S.power;
    S.power = p;
    if (!S.ready || !prev || !S.settings.features.battery || !p.hasBattery) { render(); return; }
    if (p.ac && !prev.ac) pushAlert({ kind: 'charging', duration: 3200, replace: true, priority: 2 });
    else if (!p.ac && p.percent >= 0 && ((p.percent <= 20 && prev.percent > 20) || (p.percent <= 10 && prev.percent > 10))) {
      pushAlert({ kind: 'low-battery', big: true, duration: 6000, replace: true, priority: 4 });
    }
    render();
  }

  function onVolume(v) {
    const prev = S.volume;
    S.volume = v;
    if (!S.ready || !prev) { render(); return; }
    if (v.deviceId !== prev.deviceId && v.deviceId) {
      if (S.settings.features.devices) pushAlert({ kind: 'device', duration: 3200, replace: true, priority: 2 });
    } else if (Math.abs(v.level - prev.level) > 0.004 || v.muted !== prev.muted) {
      if (S.settings.features.volume) pushAlert({ kind: 'volume', duration: 1800, replace: true, priority: 1 });
    }
    render();
  }

  function onPrivacy(p) {
    const prev = S.privacy || { mic: [], cam: [] };
    S.privacy = { mic: p.mic || [], cam: p.cam || [] };
    if (S.ready && S.settings.features.privacy) {
      const newCam = S.privacy.cam.find(a => !prev.cam.includes(a));
      const newMic = S.privacy.mic.find(a => !prev.mic.includes(a));
      if (newCam || newMic) pushAlert({ kind: 'privacy', duration: 2600, replace: true, priority: 2, data: { app: newCam || newMic, cam: !!newCam } });
    }
    render();
  }

  // ---------------- Rendering ----------------
  let currentView = null;

  function render() {
    if (!S.ready) return;
    const t = now();
    const set = S.settings;
    const acts = Core.liveActivities({ media: media(), timers: S.timers, stopwatch: S.stopwatch, privacy: S.privacy }, set, t)
      .filter(a => a.kind !== 'privacy');
    let view;
    if (S.expanded) view = 'expanded';
    else if (S.alert) view = S.alert.kind === 'notif' ? 'notif' : S.alert.big ? 'big' : 'alert';
    else if (acts.length) view = 'compact';
    else view = 'idle';

    const primary = acts[0] || null;
    const secondary = view === 'compact' || view === 'idle' ? acts[1] : (view === 'alert' || view === 'notif' || view === 'big' ? acts[0] : null);

    // tint from album art
    const m = media();
    const thumb = thumbOf(m);
    if (m && thumb) artColor(m.thumb, thumb);
    const tint = (set.glow && m && m.thumb && S.colors[m.thumb]) || set.accent;
    document.documentElement.style.setProperty('--tint', tint);
    const glowOn = set.glow && set.theme !== 'light' && m && m.status === 'playing' && (view === 'expanded' || view === 'compact') && (view !== 'compact' || (primary && primary.kind === 'media'));
    islandEl.classList.toggle('glow-on', !!glowOn);

    if (view === 'idle') renderIdle(t);
    if (view === 'compact') renderCompact(primary, t);
    if (view === 'alert') renderAlert(t);
    if (view === 'notif') renderNotif(t);
    if (view === 'big') renderBig(t);
    if (view === 'expanded') renderExpanded(t, primary);
    renderBubble(secondary, view, t);

    const viewEl = islandEl.querySelector(`.view[data-view="${view}"]`);
    if (view !== currentView) {
      islandEl.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === viewEl));
      islandEl.dataset.view = view;
      currentView = view;
    }
    size(viewEl, view);
  }

  function size(viewEl, view) {
    const set = S.settings;
    let w = viewEl.offsetWidth, h = viewEl.offsetHeight;
    let radius = h / 2;
    if (view === 'idle') {
      w = set.idleStyle === 'dot' ? 34 : set.idleWidth;
      if (S.privacy && (S.privacy.mic.length || S.privacy.cam.length) && set.idleStyle !== 'dot') w = Math.max(w, 150);
      viewEl.style.width = w + 'px';
      h = 34; radius = 17;
    }
    if (view === 'notif' || view === 'big') radius = Math.min(32, h / 2);
    if (view === 'expanded') {
      radius = 34;
      // While the pointer is inside, never shrink (switching tabs must not pull the island out from under the mouse).
      if (S.hover && S.keepH) { h = Math.max(h, S.keepH); w = Math.max(w, S.keepW); }
      S.keepH = h; S.keepW = w;
    } else { S.keepH = 0; S.keepW = 0; }
    islandEl.style.width = w + 'px';
    islandEl.style.height = h + 'px';
    islandEl.style.borderRadius = radius + 'px';
    islandEl.classList.toggle('idle-hidden', view === 'idle' && set.idleStyle === 'hidden' && !S.hover);
  }

  function dotsHtml() {
    const p = S.privacy || {};
    let h = '';
    if (S.settings.features.privacy) {
      if ((p.cam || []).length) h += '<span class="dot cam" title="Camera in use"></span>';
      else if ((p.mic || []).length) h += '<span class="dot mic" title="Microphone in use"></span>';
    }
    if (S.settings.dnd) h += `<span class="dot dnd" title="Do not disturb">${ICONS.moon}</span>`;
    return h;
  }

  function renderIdle(t) {
    const clock = $('idleClock');
    const style = S.settings.idleStyle;
    clock.textContent = style === 'clock' ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    $('idleDots').innerHTML = dotsHtml();
  }

  function setHtml(el, html) { if (el.__h !== html) { el.innerHTML = html; el.__h = html; } }

  function vizHtml(playing) {
    if (!S.settings.visualizer) return '';
    return `<div class="viz ${playing ? 'on' : ''}"><i></i><i></i><i></i><i></i><i></i></div>`;
  }

  function ringSvg(frac, size, stroke) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - Math.max(0, Math.min(1, frac)))).toFixed(2)}"/></svg>`;
  }

  function renderCompact(a, t) {
    const lead = $('cLead'), trail = $('cTrail');
    if (a.kind === 'media') {
      const m = media();
      const th = thumbOf(m);
      setHtml(lead, th ? `<img class="art" src="${esc(th)}" alt="">` : appBadge(m.app, '', 24));
      setHtml(trail, (vizHtml(m.status === 'playing') || `<span class="glyph sm">${m.status === 'playing' ? ICONS.pause : ICONS.play}</span>`) + dotsHtml());
    } else if (a.kind === 'timer') {
      const tm = S.timers.find(x => x.id === a.id) || S.timers[0];
      const left = Core.timerLeft(tm, t);
      setHtml(lead, `<span class="glyph c-orange">${ICONS.timer}</span>`);
      setHtml(trail, `<span class="value c-orange">${Core.formatTime(Math.ceil(left / 1000))}</span>` + dotsHtml());
    } else if (a.kind === 'stopwatch') {
      setHtml(lead, `<span class="glyph c-orange">${ICONS.stopwatch}</span>`);
      setHtml(trail, `<span class="value">${fmtSw(Core.stopwatchElapsed(S.stopwatch, t), false)}</span>` + dotsHtml());
    }
  }

  function fmtSw(ms, cs) {
    const s = Math.floor(ms / 1000);
    const base = Core.formatTime(s);
    return cs ? base + '.' + String(Math.floor((ms % 1000) / 10)).padStart(2, '0') : base;
  }

  function battHtml(p, colorClass) {
    const pct = Math.max(0, Math.min(100, p && p.percent >= 0 ? p.percent : 100));
    return `<span class="batt ${colorClass}"><i style="width:${pct}%"></i></span>`;
  }

  function renderAlert(t) {
    const a = S.alert, lead = $('aLead'), trail = $('aTrail');
    const p = S.power || {};
    if (a.kind === 'charging') {
      setHtml(lead, `<span class="glyph c-green">${ICONS.bolt}</span><span class="label">Charging</span>`);
      setHtml(trail, `<span class="value c-green">${p.percent >= 0 ? p.percent + '%' : ''}</span>${battHtml(p, 'c-green')}`);
    } else if (a.kind === 'volume') {
      const v = S.volume || { level: 0 };
      const ic = v.muted || v.level === 0 ? 'mute' : v.level < 0.5 ? 'volumeLow' : 'volume';
      setHtml(lead, `<span class="glyph">${ICONS[ic]}</span>`);
      const pct = Math.round((v.muted ? 0 : v.level) * 100);
      const html = `<div class="vbar ${v.muted ? 'muted' : ''}" id="vbar"><i style="width:${pct}%"></i></div><span class="value" style="min-width:34px;text-align:right">${v.muted ? 'Off' : pct}</span>`;
      setHtml(trail, html);
    } else if (a.kind === 'device') {
      const v = S.volume || {};
      const head = /head|bud|pod|ear|bluetooth|hands-free|headset|wh-|wf-/i.test(v.device || '');
      setHtml(lead, `<span class="glyph c-accent">${ICONS[head ? 'headphones' : 'speaker']}</span><span class="track-text"><span class="t2">Audio output</span><span class="t1">${esc(shortDevice(v.device))}</span></span>`);
      setHtml(trail, `<span class="glyph sm c-green">${ICONS.check}</span>`);
    } else if (a.kind === 'privacy') {
      const cam = a.data.cam;
      setHtml(lead, `<span class="glyph ${cam ? 'c-green' : 'c-orange'}">${ICONS[cam ? 'camera' : 'mic']}</span><span class="label">${esc(a.data.app)}</span>`);
      setHtml(trail, `<span class="t2" style="font-size:12px;color:var(--muted)">${cam ? 'Camera' : 'Microphone'} in use</span><span class="dot ${cam ? 'cam' : 'mic'}"></span>`);
    } else if (a.kind === 'track') {
      const m = media();
      if (!m) { endAlert(a.id); return; }
      const th = thumbOf(m);
      setHtml(lead, (th ? `<img class="art" src="${esc(th)}" alt="">` : appBadge(m.app, '', 24)) + `<span class="track-text"><span class="t1">${esc(m.title)}</span><span class="t2">${esc(m.artist || Core.appInfo(m.app).name)}</span></span>`);
      setHtml(trail, vizHtml(true));
    } else if (a.kind === 'dnd') {
      setHtml(lead, `<span class="glyph" style="color:#8e8cff">${ICONS.moon}</span><span class="label">Do not disturb</span>`);
      setHtml(trail, `<span class="label" style="color:${S.settings.dnd ? '#8e8cff' : 'var(--muted)'}">${S.settings.dnd ? 'On' : 'Off'}</span>`);
    }
  }

  function shortDevice(name) {
    return String(name || 'Default device').replace(/\s*\((.*)\)\s*$/, (m0, inner) => /realtek|high definition|intel|amd|nvidia/i.test(inner) ? '' : ` (${inner})`).trim() || name;
  }

  function renderNotif(t) {
    const a = S.alert, n = a.data;
    const view = islandEl.querySelector('.v-notif');
    view.classList.toggle('detail', S.detail);
    const ic = notifIconHtml(n);
    const iconEl = $('nIcon');
    iconEl.className = ic.cls; iconEl.setAttribute('style', ic.style); setHtml(iconEl, ic.html);
    $('nApp').textContent = Core.appInfo(n.appId, n.app).name;
    $('nTime').textContent = Core.relativeTime(n.time, t);
    const hideBody = !S.settings.showNotificationBody && !S.detail;
    $('nTitle').textContent = hideBody ? 'New notification' : (n.title || Core.appInfo(n.appId, n.app).name);
    $('nBody').textContent = hideBody ? 'Hover to read' : (n.body || '');
    $('nBody').style.display = $('nBody').textContent ? '' : 'none';
    const more = (a.count > 1 ? `${a.count} new` : '') + (S.alerts.filter(x => x.kind === 'notif').length ? `${a.count > 1 ? ' · ' : ''}+${S.alerts.filter(x => x.kind === 'notif').length} waiting` : '');
    $('nMore').textContent = more;
  }

  function renderBig(t) {
    const a = S.alert;
    const ic = $('bIcon');
    if (a.kind === 'timer-done') {
      ic.className = 'big-icon c-orange'; setHtml(ic, ICONS.timer);
      $('bLabel').textContent = a.data.label || 'Timer';
      $('bValue').textContent = 'Time’s up';
      setHtml($('bActions'), `<button class="round-btn orange" data-act="timer-repeat" title="Repeat">${ICONS.reset}</button><button class="round-btn red" data-act="alert-close" title="Stop">${ICONS.close}</button>`);
    } else if (a.kind === 'low-battery') {
      const p = S.power || {};
      ic.className = 'big-icon c-red'; setHtml(ic, ICONS.battery);
      $('bLabel').textContent = 'Low battery';
      $('bValue').textContent = `${p.percent}% remaining`;
      setHtml($('bActions'), `<button class="round-btn" data-act="alert-close" title="Close">${ICONS.close}</button>`);
    }
  }

  // ---------- expanded ----------
  function tabsFor() {
    const tabs = [];
    if (media() && S.settings.features.media) tabs.push('media');
    if (S.settings.features.timers) tabs.push('timer');
    if (S.settings.features.notifications) tabs.push('notifs');
    tabs.push('home');
    return tabs;
  }

  function defaultTab(primary) {
    if (primary && primary.kind === 'media') return 'media';
    if (primary && (primary.kind === 'timer' || primary.kind === 'stopwatch')) return 'timer';
    if (S.unread > 0 && S.settings.features.notifications) return 'notifs';
    if (media() && S.settings.features.media) return 'media';
    return 'home';
  }

  function renderExpanded(t, primary) {
    const tabs = tabsFor();
    if (!S.tab || !tabs.includes(S.tab)) S.tab = defaultTab(primary);
    if (S.tab === 'notifs') S.unread = 0;
    const tabIcons = { media: 'music', timer: 'timer', notifs: 'bell', home: 'home' };
    const tabNames = { media: 'Now playing', timer: 'Timers', notifs: 'Notifications', home: 'Home' };
    setHtml($('tabs'), tabs.length > 1 ? tabs.map(k => `<button class="${k === S.tab ? 'on' : ''}" data-tab="${k}" title="${tabNames[k]}">${ICONS[tabIcons[k]]}${k === 'notifs' && S.unread ? `<span class="badge">${S.unread}</span>` : ''}</button>`).join('') : '');
    islandEl.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.dataset.pane === S.tab));
    if (S.tab === 'media') renderMediaPane(t);
    if (S.tab === 'timer') renderTimerPane(t);
    if (S.tab === 'notifs') renderNotifPane(t);
    if (S.tab === 'home') renderHomePane(t);
  }

  function renderMediaPane(t) {
    const m = media();
    if (!m) return;
    const th = thumbOf(m);
    const wrap = $('mArt').parentElement;
    if (th) { if ($('mArt').getAttribute('src') !== th) $('mArt').src = th; wrap.classList.remove('noart'); }
    else {
      wrap.classList.add('noart');
      const a = Core.appInfo(m.app);
      $('mArtFallback').style.background = a.color;
      setHtml($('mArtFallback'), ICONS[m.kind === 'video' ? 'video' : a.glyph] || ICONS.music);
    }
    const titleEl = $('mTitle');
    if (titleEl.textContent !== (m.title || 'Unknown')) {
      titleEl.textContent = m.title || 'Unknown';
      const box = titleEl.parentElement;
      box.classList.remove('scroll');
      requestAnimationFrame(() => {
        const over = titleEl.scrollWidth - box.clientWidth;
        if (over > 4) {
          box.style.setProperty('--marquee-dist', `-${over + 40}px`);
          box.style.setProperty('--marquee-time', `${Math.max(6, over / 18)}s`);
          box.classList.add('scroll');
        }
      });
    }
    $('mArtist').textContent = [m.artist, m.album && m.album !== m.title ? m.album : ''].filter(Boolean).join(' — ') || Core.appInfo(m.app).name;
    const viz = $('mViz');
    viz.classList.toggle('on', m.status === 'playing');
    viz.classList.toggle('hide', !S.settings.visualizer);

    const dur = m.duration || 0;
    const pos = S.drag ? S.drag.pos : Core.livePosition(m, t);
    const frac = dur > 0 ? Math.min(1, pos / dur) : 0;
    $('mFill').style.width = (frac * 100) + '%';
    $('mKnob').style.left = (frac * 100) + '%';
    $('mPos').textContent = dur > 0 ? Core.formatTime(pos) : (m.status === 'playing' ? 'LIVE' : '');
    $('mRem').textContent = dur > 0 ? '-' + Core.formatTime(Math.max(0, dur - pos)) : '';
    $('mBar').classList.toggle('disabled', !m.canSeek || dur <= 0);

    setHtml($('mPlay'), m.status === 'playing' ? ICONS.pause : ICONS.play);
    if (!$('mPrev').innerHTML) { $('mPrev').innerHTML = ICONS.prev; $('mNext').innerHTML = ICONS.next; $('mShuffle').innerHTML = ICONS.shuffle; }
    $('mPrev').disabled = !m.canPrev; $('mNext').disabled = !m.canNext;
    $('mPlay').disabled = !(m.canPlay || m.canPause);
    $('mShuffle').classList.toggle('hidden', !m.canShuffle); $('mShuffle').classList.toggle('on', !!m.shuffle);
    setHtml($('mRepeat'), m.repeat === 'track' ? ICONS.repeatOne : ICONS.repeat);
    $('mRepeat').classList.toggle('hidden', !m.canRepeat); $('mRepeat').classList.toggle('on', m.repeat && m.repeat !== 'none');

    const a = Core.appInfo(m.app);
    setHtml($('mSrc'), `${appBadge(m.app)}<span>${esc(a.name)}</span><span class="glyph sm" style="width:12px;height:12px">${ICONS.open}</span>`);
    const list = S.sessions.filter(s => s.title || s.artist);
    setHtml($('mSessions'), list.length > 1 ? list.map(s => `<button class="${s.id === m.id ? 'on' : ''}" data-session="${esc(s.id)}" title="${esc(Core.appInfo(s.app).name + ' — ' + s.title)}"></button>`).join('') : '');
  }

  function renderTimerPane(t) {
    const rows = S.timers.map(tm => {
      const left = Core.timerLeft(tm, t);
      const paused = tm.pausedLeft != null;
      return `<div class="t-item">
        <div class="ring">${ringSvg(left / tm.total, 44, 4)}<span class="glyph">${ICONS.timer}</span></div>
        <div class="t-info"><div class="t-label">${esc(tm.label)}</div><div class="t-left ${paused ? 'paused' : ''}">${Core.formatTime(Math.ceil(left / 1000))}</div></div>
        <div class="t-btns">
          <button class="round-btn" data-act="timer-add" data-id="${tm.id}" title="+1 minute">${ICONS.plus}</button>
          <button class="round-btn orange" data-act="${paused ? 'timer-resume' : 'timer-pause'}" data-id="${tm.id}" title="${paused ? 'Resume' : 'Pause'}">${paused ? ICONS.play : ICONS.pause}</button>
          <button class="round-btn red" data-act="timer-cancel" data-id="${tm.id}" title="Cancel">${ICONS.close}</button>
        </div></div>`;
    }).join('');
    setHtml($('tList'), rows ? `<div class="section-label">Timers</div>${rows}` : '');
    const sw = S.stopwatch;
    const el = Core.stopwatchElapsed(sw, t);
    setHtml($('tStopwatch'), `<div class="ring" style="color:var(--fg)">${ringSvg((el % 60000) / 60000, 44, 4)}<span class="glyph">${ICONS.stopwatch}</span></div>
      <div class="t-info"><div class="t-label">Stopwatch${sw.laps.length ? ` · lap ${sw.laps.length}: ${fmtSw(sw.laps[0], true)}` : ''}</div><div class="t-left">${fmtSw(el, true)}</div></div>
      <div class="t-btns">
        ${sw.running ? `<button class="round-btn" data-act="sw-lap" title="Lap">${ICONS.flag}</button>` : (el > 0 ? `<button class="round-btn" data-act="sw-reset" title="Reset">${ICONS.reset}</button>` : '')}
        <button class="round-btn ${sw.running ? 'red' : 'green'}" data-act="sw-toggle" title="${sw.running ? 'Pause' : 'Start'}">${sw.running ? ICONS.pause : ICONS.play}</button>
      </div>`);
    setHtml($('tPresets'), [1, 3, 5, 10, 15, 25, 30, 60].map(m => `<button class="chip" data-act="timer-start" data-min="${m}">${ICONS.plus.replace('<svg', '<svg class="glyph"')}${m >= 60 ? m / 60 + ' h' : m + ' min'}</button>`).join(''));
  }

  function renderNotifPane(t) {
    const list = S.history.slice().reverse().slice(0, 25);
    if (!list.length) { setHtml($('nList'), `<div class="nl-empty">${S.settings.dnd ? 'Do not disturb is on.<br>' : ''}No notifications</div>`); return; }
    setHtml($('nList'), list.map(n => {
      const ic = notifIconHtml(n);
      const a = Core.appInfo(n.appId, n.app);
      return `<div class="nl-item" data-act="nl-open" data-id="${esc(n.id)}">
        <div class="${ic.cls}" style="${ic.style}">${ic.html}</div>
        <div class="n-text"><div class="n-head"><span class="n-app">${esc(a.name)}</span><span class="n-time">${Core.relativeTime(n.time, t)}</span></div>
        <div class="n-title">${esc(n.title)}</div>${n.body && S.settings.showNotificationBody ? `<div class="n-body">${esc(n.body)}</div>` : ''}</div>
        <button class="x" data-act="nl-dismiss" data-id="${esc(n.id)}" title="Dismiss">${ICONS.close}</button></div>`;
    }).join(''));
  }

  function renderHomePane(t) {
    const d = new Date(t);
    $('hTime').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('hDate').innerHTML = esc(d.toLocaleDateString([], { weekday: 'long' })) + '<br>' + esc(d.toLocaleDateString([], { day: 'numeric', month: 'long' }));
    const stats = [];
    const p = S.power;
    if (p && p.hasBattery) stats.push(`<span class="stat ${p.ac ? 'c-green' : p.percent <= 20 ? 'c-red' : ''}">${p.ac ? icon('bolt') : ''}${battHtml(p, '')} ${p.percent}%${!p.ac && p.minutesLeft > 0 ? ` · ${Math.floor(p.minutesLeft / 60)} h ${p.minutesLeft % 60} min` : ''}</span>`);
    if (S.volume) stats.push(`<span class="stat">${icon(S.volume.muted ? 'mute' : 'volume')} ${S.volume.muted ? 'Muted' : Math.round(S.volume.level * 100) + '%'}</span>`);
    const pr = S.privacy || {};
    if ((pr.cam || []).length) stats.push(`<span class="stat c-green">${icon('camera')} ${esc(pr.cam.join(', '))}</span>`);
    else if ((pr.mic || []).length) stats.push(`<span class="stat c-orange">${icon('mic')} ${esc(pr.mic.join(', '))}</span>`);
    setHtml($('hStats'), stats.join(''));
    const dnd = $('hDnd');
    dnd.classList.toggle('on', S.settings.dnd);
    setHtml(dnd, `${icon('moon')}Focus`);
    setHtml(islandEl.querySelector('[data-act="h-timer"]'), `${icon('timer')}Timer`);
    setHtml(islandEl.querySelector('[data-act="h-stopwatch"]'), `${icon('stopwatch')}Stopwatch`);
    setHtml(islandEl.querySelector('[data-act="settings"]'), `${icon('settings')}Settings`);
  }

  function renderBubble(a, view, t) {
    bubbleEl.classList.toggle('show', !!a && view !== 'expanded');
    if (!a) return;
    if (a.kind === 'media') {
      const m = media(); const th = thumbOf(m);
      setHtml(bubbleEl, th ? `<img src="${esc(th)}" alt="">` : `<span class="glyph c-tint">${ICONS.music}</span>`);
      bubbleEl.dataset.kind = 'media';
    } else if (a.kind === 'timer') {
      const tm = S.timers.find(x => x.id === a.id) || S.timers[0];
      setHtml(bubbleEl, `<span class="mini-ring">${ringSvg(Core.timerLeft(tm, t) / tm.total, 28, 3)}</span>`);
      bubbleEl.dataset.kind = 'timer';
    } else if (a.kind === 'stopwatch') {
      setHtml(bubbleEl, `<span class="glyph c-orange">${ICONS.stopwatch}</span>`);
      bubbleEl.dataset.kind = 'timer';
    }
  }

  // ---------------- Interaction ----------------
  let hoverTimer = null, leaveTimer = null;

  function expand(tab) {
    clearTimeout(leaveTimer);
    if (tab) S.tab = tab;
    else if (!S.expanded) S.tab = null;
    S.expanded = true;
    render();
  }
  function collapse() { S.expanded = false; S.detail = false; render(); }

  function onEnter() {
    S.hover = true;
    clearTimeout(leaveTimer);
    if (S.alert && S.alert.kind === 'notif') {
      // Hovering a banner keeps it open and reveals the full message + actions.
      S.alert.until = Infinity;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { S.detail = true; render(); }, Math.min(S.settings.hoverDelay, 200));
      render(); return;
    }
    if (S.alert && S.alert.kind === 'volume') { S.alert.until = Infinity; return; }
    if (S.settings.expandOn === 'hover' && !S.expanded && !(S.alert && S.alert.big)) {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { if (S.hover) { if (S.alert) { S.alerts.unshift(S.alert); S.alert = null; } expand(); } }, S.settings.hoverDelay);
    }
    render();
  }

  function onLeave() {
    S.hover = false;
    clearTimeout(hoverTimer);
    if (S.alert && (S.alert.kind === 'notif' || S.alert.kind === 'volume') && S.alert.until === Infinity) S.alert.until = now() + 1500;
    if (S.drag) return;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (S.hover || S.drag) return;
      if (S.detail) { S.detail = false; render(); }
      if (S.expanded) collapse();
      // pending alerts that were put on hold while expanded come back
      if (!S.alert && S.alerts.length) nextAlert();
    }, S.settings.expandOn === 'hover' ? S.settings.collapseDelay : Math.max(3000, S.settings.collapseDelay));
    render();
  }

  [islandEl, bubbleEl].forEach(el => {
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
  });

  // Click-through: the window ignores the mouse except over the island and bubble.
  let interactive = null;
  function setInteractive(on) {
    if (on === interactive) return;
    interactive = on;
    api && api.send('island:interactive', on);
  }
  document.addEventListener('mousemove', e => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setInteractive(!!(el && (islandEl.contains(el) || bubbleEl.contains(el))) || !!S.drag);
  });
  document.addEventListener('mouseleave', () => { if (!S.drag) setInteractive(false); });

  bubbleEl.addEventListener('click', () => {
    const k = bubbleEl.dataset.kind;
    if (S.alert) { S.alerts.unshift(S.alert); S.alert = null; }
    expand(k === 'media' ? 'media' : 'timer');
  });

  islandEl.addEventListener('mousedown', () => islandEl.classList.add('pressed'));
  window.addEventListener('mouseup', () => islandEl.classList.remove('pressed'));

  islandEl.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { S.tab = tab.dataset.tab; render(); return; }
    const ses = e.target.closest('[data-session]');
    if (ses) { S.preferredSession = ses.dataset.session; render(); return; }
    const actEl = e.target.closest('[data-act]');
    if (actEl) { e.stopPropagation(); act(actEl.dataset.act, actEl); return; }
    // plain click on the island body
    if (S.alert && S.alert.kind === 'notif') { openNotif(S.alert.data); return; }
    if (S.alert && !S.alert.big) { const k = S.alert.kind; endAlert(); if (k === 'track') expand('media'); return; }
    if (S.expanded) { if (S.settings.expandOn === 'click') collapse(); return; }
    expand();
  });

  islandEl.addEventListener('contextmenu', e => { e.preventDefault(); api && api.send('island:open-settings'); });

  function openNotif(n) {
    if (!n) return;
    command({ cmd: 'open-app', appId: n.appId });
    if (S.alert && S.alert.kind === 'notif' && S.alert.data.id === n.id) endAlert();
  }

  function act(a, el) {
    const id = el.dataset.id;
    switch (a) {
      case 'm-toggle': mediaCmd('toggle'); optimisticToggle(); break;
      case 'm-next': mediaCmd('next'); break;
      case 'm-prev': mediaCmd('prev'); break;
      case 'm-shuffle': mediaCmd('shuffle'); break;
      case 'm-repeat': mediaCmd('repeat'); break;
      case 'm-focus': mediaCmd('focus'); break;
      case 'n-open': openNotif(S.alert && S.alert.data); break;
      case 'n-dismiss': if (S.alert) { command({ cmd: 'notif-dismiss', id: S.alert.data.id }); S.history = S.history.filter(n => n.id !== S.alert.data.id); endAlert(); } break;
      case 'n-clear': command({ cmd: 'notif-clear' }); S.history = []; render(); break;
      case 'nl-open': openNotif(S.history.find(n => n.id === id)); break;
      case 'nl-dismiss': command({ cmd: 'notif-dismiss', id }); S.history = S.history.filter(n => n.id !== id); render(); break;
      case 'timer-start': startTimer(Number(el.dataset.min)); break;
      case 'timer-pause': timerAction(id, 'pause'); break;
      case 'timer-resume': timerAction(id, 'resume'); break;
      case 'timer-add': timerAction(id, 'add'); break;
      case 'timer-cancel': timerAction(id, 'cancel'); break;
      case 'timer-repeat': { const d = S.alert && S.alert.data; endAlert(); if (d) startTimer(d.total / 60000, d.label); break; }
      case 'sw-toggle': stopwatch('toggle'); break;
      case 'sw-lap': stopwatch('lap'); break;
      case 'sw-reset': stopwatch('reset'); break;
      case 'alert-close': endAlert(); break;
      case 'dnd': api && api.invoke('settings:set', { dnd: !S.settings.dnd }); break;
      case 'h-timer': S.tab = 'timer'; render(); break;
      case 'h-stopwatch': S.tab = 'timer'; stopwatch('start'); break;
      case 'settings': api && api.send('island:open-settings'); break;
    }
  }

  function optimisticToggle() {
    const m = media();
    if (!m) return;
    m.position = Core.livePosition(m, now()); m.updatedAt = now();
    m.status = m.status === 'playing' ? 'paused' : 'playing';
    render();
  }

  // Seek bar (drag to scrub) and volume bar.
  function barFraction(bar, e) {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }
  islandEl.addEventListener('pointerdown', e => {
    const bar = e.target.closest('#mBar');
    const vbar = e.target.closest('#vbar');
    if (bar && !bar.classList.contains('disabled')) {
      const m = media(); if (!m) return;
      bar.setPointerCapture(e.pointerId);
      S.drag = { kind: 'seek', bar, pos: barFraction(bar, e) * m.duration };
      bar.classList.add('drag'); render();
    } else if (vbar) {
      vbar.setPointerCapture(e.pointerId);
      S.drag = { kind: 'volume', bar: vbar };
      setVolume(barFraction(vbar, e));
    }
  });
  islandEl.addEventListener('pointermove', e => {
    if (!S.drag) return;
    if (S.drag.kind === 'seek') { const m = media(); if (m) { S.drag.pos = barFraction(S.drag.bar, e) * m.duration; render(); } }
    else setVolume(barFraction(S.drag.bar, e));
  });
  function endDrag(e) {
    if (!S.drag) return;
    const d = S.drag; S.drag = null;
    if (d.kind === 'seek') {
      d.bar.classList.remove('drag');
      const m = media();
      if (m) { mediaCmd('seek', { position: d.pos }); m.position = d.pos; m.updatedAt = now(); }
    }
    render();
    if (!S.hover) onLeave();
  }
  islandEl.addEventListener('pointerup', endDrag);
  islandEl.addEventListener('pointercancel', endDrag);
  function setVolume(f) {
    command({ cmd: 'volume-set', level: f });
    if (S.volume) { S.volume.level = f; S.volume.muted = false; }
    if (S.alert && S.alert.kind === 'volume') S.alert.until = Infinity;
    render();
  }

  // Keyboard-free, but the wheel over the expanded media pane scrubs ±5 s, and over the volume HUD changes volume.
  islandEl.addEventListener('wheel', e => {
    if (S.alert && S.alert.kind === 'volume' && S.volume) { setVolume(Math.max(0, Math.min(1, S.volume.level - Math.sign(e.deltaY) * 0.04))); return; }
    if (S.expanded && S.tab === 'media') {
      const m = media(); if (!m || !m.canSeek || !m.duration) return;
      const p = Math.max(0, Math.min(m.duration, Core.livePosition(m, now()) - Math.sign(e.deltaY) * 5));
      mediaCmd('seek', { position: p }); m.position = p; m.updatedAt = now(); render();
    }
  }, { passive: true });

  // ---------------- Settings & layout ----------------
  function applySettings(s) {
    S.settings = IslandSettings.normalize(s);
    const b = document.body;
    b.className = b.className.replace(/\b(theme|anim)-\S+/g, '').trim();
    b.classList.add('theme-' + S.settings.theme, 'anim-' + S.settings.animation);
    document.documentElement.style.setProperty('--accent', S.settings.accent);
    render();
  }

  function applyLayout(l) {
    const st = $('stage');
    st.className = `v-${l.vertical} h-${l.horizontal}`;
    document.documentElement.style.setProperty('--scale', l.scale || 1);
    document.documentElement.style.setProperty('--offset-y', (l.offsetY ?? 10) + 'px');
  }

  // Preview requests from the settings window.
  function preview(kind) {
    switch (kind) {
      case 'expand': expand(); break;
      case 'media': expand('media'); break;
      case 'timer': startTimer(1, 'Preview timer'); break;
      case 'timer-done': pushAlert({ kind: 'timer-done', big: true, duration: 6000, priority: 5, data: { label: '5 min timer', total: 300000 } }); break;
      case 'collapse': collapse(); break;
      case 'dnd': pushAlert({ kind: 'dnd', duration: 2000, replace: true }); break;
      case 'notification':
        onNotification({ id: 'preview' + now(), appId: 'com.winisland.app', app: 'WinIsland', title: 'This is a notification', body: 'Hover over the island to read the whole message and see actions.', time: now() });
        break;
    }
  }

  // ---------------- Wiring ----------------
  if (api) {
    api.on('snapshot', snap => {
      applySettings(snap.settings);
      S.thumbs = Object.assign({}, snap.thumbs || {});
      S.history = (snap.history || []).slice();
      S.power = snap.power; S.volume = snap.volume; S.privacy = snap.privacy || S.privacy;
      S.ready = true;
      if (snap.media) onMedia(snap.media);
      render();
    });
    api.on('event', onEvent);
    api.on('settings', s => {
      const dndChanged = S.settings.dnd !== s.dnd;
      applySettings(s);
      if (dndChanged) pushAlert({ kind: 'dnd', duration: 1800, replace: true });
    });
    api.on('layout', applyLayout);
    api.on('preview', preview);
    api.on('action', a => {
      if (a.type === 'timer-start') startTimer(a.minutes);
      if (a.type === 'stopwatch-toggle') stopwatch('toggle');
    });
  }
  if (params.get('backdrop') === '1' || params.get('test') === '1') document.body.classList.add('backdrop');

  loadLocal();
  setInterval(() => {
    checkTimers();
    if (S.alert && now() > S.alert.until) { const k = S.alert.kind; if (k === 'timer-done') stopChime(); nextAlert(); }
    render();
  }, 250);

  // Exposed for the UI tests.
  window.__island = { S, render, expand, collapse, startTimer, stopwatch, preview, onEvent, onEnter, onLeave, act };
})();
