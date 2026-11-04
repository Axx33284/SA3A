// Pure logic used by the island window and the tests: app names, media timeline,
// which live activity wins the island, time formatting and window placement.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IslandCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Apps ----------
  // Known AppUserModelIDs (what Windows reports for media sessions and toasts).
  const KNOWN_APPS = [
    { test: /cinhimbnkkaeohfgghhklpknlkffjgod|youtube ?music/i, name: 'YouTube Music', color: '#ff0033', glyph: 'ytmusic' },
    { test: /agimnkijcaahngcdmfeangaknmldooml|youtube/i, name: 'YouTube', color: '#ff0033', glyph: 'youtube' },
    { test: /spotify/i, name: 'Spotify', color: '#1ed760', glyph: 'spotify' },
    { test: /applemusic|apple ?music/i, name: 'Apple Music', color: '#fa2d48', glyph: 'music' },
    { test: /appletv/i, name: 'Apple TV', color: '#a2aaad', glyph: 'video' },
    { test: /zunemusic|mediaplayer/i, name: 'Media Player', color: '#ff7a00', glyph: 'music' },
    { test: /zunevideo/i, name: 'Movies & TV', color: '#0078d4', glyph: 'video' },
    { test: /vlc/i, name: 'VLC', color: '#ff8800', glyph: 'video' },
    { test: /deezer/i, name: 'Deezer', color: '#a238ff', glyph: 'music' },
    { test: /tidal/i, name: 'TIDAL', color: '#ffffff', glyph: 'music' },
    { test: /amazonmusic|amazon ?music/i, name: 'Amazon Music', color: '#25d1da', glyph: 'music' },
    { test: /soundcloud/i, name: 'SoundCloud', color: '#ff5500', glyph: 'music' },
    { test: /netflix/i, name: 'Netflix', color: '#e50914', glyph: 'video' },
    { test: /discord/i, name: 'Discord', color: '#5865f2', glyph: 'chat' },
    { test: /whatsapp/i, name: 'WhatsApp', color: '#25d366', glyph: 'chat' },
    { test: /telegram/i, name: 'Telegram', color: '#2aabee', glyph: 'chat' },
    { test: /teams/i, name: 'Microsoft Teams', color: '#6264a7', glyph: 'chat' },
    { test: /slack/i, name: 'Slack', color: '#e01e5a', glyph: 'chat' },
    { test: /outlook|olk\.exe|microsoft\.office\.outlook/i, name: 'Outlook', color: '#0f6cbd', glyph: 'mail' },
    { test: /windowscommunicationsapps|mail/i, name: 'Mail', color: '#0f6cbd', glyph: 'mail' },
    { test: /^msedge|microsoftedge/i, name: 'Microsoft Edge', color: '#1fb5a7', glyph: 'browser' },
    { test: /^chrome|google\\chrome/i, name: 'Google Chrome', color: '#4285f4', glyph: 'browser' },
    { test: /^308046b0af4a39cb$|firefox/i, name: 'Firefox', color: '#ff7139', glyph: 'browser' },
    { test: /brave/i, name: 'Brave', color: '#fb542b', glyph: 'browser' },
    { test: /opera/i, name: 'Opera', color: '#ff1b2d', glyph: 'browser' },
    { test: /winisland|com\.winisland/i, name: 'WinIsland', color: '#0a84ff', glyph: 'island' }
  ];

  function appInfo(appId, reportedName) {
    const id = String(appId || '');
    for (const a of KNOWN_APPS) {
      if (a.test.test(id)) return { name: a.name, color: a.color, glyph: a.glyph };
    }
    let name = (reportedName || '').trim();
    if (!name) {
      // "C:\\Program Files\\Foo\\foo.exe" / "Publisher.App_hash!App" / "Foo.exe" -> "Foo"
      name = id.split(/[\\/]/).pop().split('!')[0].replace(/_[a-z0-9]{13}$/i, '').replace(/\.exe$/i, '');
      const dot = name.split('.');
      if (dot.length > 1) name = dot[dot.length - 1] === 'App' ? dot[dot.length - 2] : dot[dot.length - 1];
      name = name.replace(/([a-z])([A-Z])/g, '$1 $2') || 'App';
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }
    return { name, color: colorFor(id || name), glyph: 'app' };
  }

  // Stable pleasant colour from a string (for apps without a brand colour).
  function colorFor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return hslToHex(hue, 62, 58);
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  // ---------- Media ----------
  // Windows gives a position plus the time it was measured; extrapolate to "now".
  function livePosition(session, now) {
    if (!session) return 0;
    const dur = Number(session.duration) || 0;
    let pos = Number(session.position) || 0;
    if (session.status === 'playing') {
      const base = session.updatedAt || session.receivedAt || now;
      const elapsed = Math.max(0, (now - base) / 1000) * (Number(session.rate) || 1);
      pos += elapsed;
    }
    if (dur > 0) pos = Math.min(pos, dur);
    return Math.max(0, pos);
  }

  // Which session the island shows: the user's pick if still there, else a playing one
  // (Windows' "current" first), else the most recently active paused one.
  function pickSession(sessions, currentId, preferredId) {
    const list = (sessions || []).filter(s => s && (s.title || s.artist) && s.status !== 'closed');
    if (!list.length) return null;
    if (preferredId) {
      const p = list.find(s => s.id === preferredId);
      if (p) return p;
    }
    const playing = list.filter(s => s.status === 'playing');
    if (playing.length) return playing.find(s => s.app === currentId || s.id === currentId) || playing[0];
    return list.find(s => s.app === currentId || s.id === currentId) || list.slice().sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))[0];
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function relativeTime(ms, now) {
    const d = Math.max(0, Math.round((now - ms) / 1000));
    if (!ms || d < 45) return 'now';
    if (d < 3600) return Math.round(d / 60) + 'm ago';
    if (d < 86400) return Math.round(d / 3600) + 'h ago';
    return Math.round(d / 86400) + 'd ago';
  }

  // ---------- Live activities ----------
  // Returns the activities that are alive right now, most important first.
  // state: { media, timers:[{id,endsAt,pausedLeft,label}], stopwatch:{startedAt,elapsed,running}, privacy:{mic:[],cam:[]} }
  function liveActivities(state, settings, now) {
    const out = [];
    const f = (settings && settings.features) || {};
    const media = state.media;
    const pausedTimeout = ((settings && settings.pausedMediaTimeout) ?? 10) * 60000;
    if (f.media !== false && media) {
      if (media.status === 'playing') out.push({ kind: 'media', rank: 1 });
      else if (pausedTimeout > 0 && now - (media.lastActive || now) < pausedTimeout) out.push({ kind: 'media', rank: 4 });
    }
    if (f.timers !== false) {
      const timers = (state.timers || []).filter(t => t.pausedLeft != null || t.endsAt > now);
      if (timers.length) {
        const soonest = timers.slice().sort((a, b) => timerLeft(a, now) - timerLeft(b, now))[0];
        out.push({ kind: 'timer', rank: 2, id: soonest.id });
      }
      if (state.stopwatch && (state.stopwatch.running || state.stopwatch.elapsed > 0)) out.push({ kind: 'stopwatch', rank: state.stopwatch.running ? 3 : 5 });
    }
    if (f.privacy !== false && state.privacy && ((state.privacy.mic || []).length || (state.privacy.cam || []).length)) {
      out.push({ kind: 'privacy', rank: 6 });
    }
    return out.sort((a, b) => a.rank - b.rank);
  }

  function timerLeft(t, now) {
    if (t.pausedLeft != null) return t.pausedLeft;
    return Math.max(0, t.endsAt - now);
  }

  function stopwatchElapsed(sw, now) {
    if (!sw) return 0;
    return (sw.elapsed || 0) + (sw.running ? now - sw.startedAt : 0);
  }

  // ---------- Placement ----------
  // Computes where the (transparent, click-through) island window goes on a display.
  // display: { bounds:{x,y,width,height}, workArea:{x,y,width,height} }
  const CANVAS = { width: 520, height: 460 };
  function placement(settings, display) {
    const scale = settings.scale || 1;
    const width = Math.round(CANVAS.width * scale);
    const height = Math.round(CANVAS.height * scale);
    const [v, h] = (settings.position || 'top-center').split('-');
    const area = v === 'top' ? display.bounds : display.workArea;
    const margin = 12;
    let x;
    if (h === 'left') x = area.x + margin;
    else if (h === 'right') x = area.x + area.width - width - margin;
    else x = area.x + Math.round((area.width - width) / 2);
    x += settings.offsetX || 0;
    x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + display.bounds.width - width));
    const y = v === 'top' ? area.y : area.y + area.height - height;
    return { x, y, width, height, vertical: v, horizontal: h };
  }

  function pickDisplay(settings, displays, primary, cursorDisplay) {
    if (settings.display === 'cursor' && cursorDisplay) return cursorDisplay;
    const found = displays.find(d => String(d.id) === String(settings.display));
    return found || primary;
  }

  // Notification filtering: muted apps and Do Not Disturb.
  function shouldBanner(n, settings) {
    if (!settings.features || settings.features.notifications === false) return false;
    if ((settings.mutedApps || []).includes(n.appId)) return false;
    if (settings.dnd) return false;
    return true;
  }

  return {
    KNOWN_APPS, appInfo, colorFor, livePosition, pickSession, formatTime, relativeTime,
    liveActivities, timerLeft, stopwatchElapsed, placement, pickDisplay, shouldBanner, CANVAS
  };
});
