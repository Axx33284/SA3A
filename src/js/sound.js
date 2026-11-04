// Plays azan, the built-in chime, local audio files and YouTube links.
// Every path falls back to the built-in chime so an alarm is never silent.
import { state } from './store.js';
import { t } from './i18n.js';
import { toast, $ } from './util.js';

export const AZAN_VOICES = ['makkah', 'madinah', 'turkish', 'alafasy'];
export const FAJR_VOICES = ['makkah-fajr', ...AZAN_VOICES];
const HAS_SHORT = new Set(AZAN_VOICES);

export function youtubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (host === 'youtu.be') return valid(u.pathname.slice(1));
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return valid(u.searchParams.get('v'));
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch { /* not a URL */ }
  return null;
  function valid(id) { return /^[\w-]{11}$/.test(id) ? id : null; }
}

function youtubeStart(url) {
  try {
    const v = new URL(url).searchParams.get('t') || '';
    const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (!m) return 0;
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  } catch { return 0; }
}

// ---------- built-in chime (Web Audio, no file needed) ----------
let ctx = null;
function chime({ loop, volume }) {
  ctx = ctx || new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  let stopped = false;
  let timer = null;
  const ring = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    [[0, 880], [0.18, 1108.73], [0.36, 1318.51], [0.62, 1760]].forEach(([at, f]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(0.5, now + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + 1.1);
      o.connect(g).connect(master);
      o.start(now + at);
      o.stop(now + at + 1.2);
    });
    timer = loop ? setTimeout(ring, 2000) : null;
  };
  ring();
  return { stop() { stopped = true; clearTimeout(timer); setTimeout(() => master.disconnect(), 1300); }, done: loop ? null : new Promise((r) => setTimeout(r, 2000)) };
}

// ---------- audio element (azan + local files) ----------
function audioEl(src, { loop, volume, onFail }) {
  const a = new Audio(src);
  a.loop = loop;
  a.volume = Math.max(0, Math.min(1, volume));
  let failed = false;
  const fail = () => { if (!failed) { failed = true; onFail?.(); } };
  a.addEventListener('error', fail);
  a.play().catch(fail);
  return {
    stop() { a.pause(); a.removeAttribute('src'); a.load(); },
    done: new Promise((r) => { a.addEventListener('ended', r); a.addEventListener('error', r); }),
  };
}

// ---------- YouTube (official embedded player) ----------
let ytApi = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApi = null; reject(new Error('youtube api')); };
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    document.head.append(s);
    setTimeout(() => reject(new Error('youtube api timeout')), 12000);
  });
  return ytApi;
}

function youtube(url, { loop, volume, onFail }) {
  const id = youtubeId(url);
  const host = $('#yt-mini');
  let player = null;
  let stopped = false;
  let started = false;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const fail = () => { if (!stopped && !started) { cleanup(); onFail?.(); } };
  const cleanup = () => {
    try { player?.destroy(); } catch { /* ignore */ }
    host.classList.remove('show');
    host.querySelector('.yt-frame').innerHTML = '';
  };
  if (!id || !navigator.onLine) { setTimeout(fail); return { stop() { stopped = true; }, done }; }

  host.querySelector('.yt-frame').innerHTML = '<div id="yt-player"></div>';
  host.classList.add('show');
  const giveUp = setTimeout(fail, 15000);
  loadYouTubeApi().then((YT) => {
    if (stopped) return;
    player = new YT.Player('yt-player', {
      width: 240, height: 135, videoId: id,
      playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1, start: youtubeStart(url), origin: location.origin },
      events: {
        onReady: (e) => { e.target.setVolume(Math.round(volume * 100)); e.target.unMute(); e.target.playVideo(); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) { started = true; clearTimeout(giveUp); }
          if (e.data === YT.PlayerState.ENDED) {
            if (loop && !stopped) e.target.seekTo(youtubeStart(url), true);
            else { cleanup(); resolveDone(); }
          }
        },
        onError: () => { clearTimeout(giveUp); fail(); },
      },
    });
  }).catch(() => { clearTimeout(giveUp); fail(); });
  return { stop() { stopped = true; clearTimeout(giveUp); cleanup(); resolveDone(); }, done };
}

/**
 * Play a sound spec: {kind:'azan',id} | {kind:'tone'} | {kind:'file',path,name} | {kind:'youtube',url}.
 * Returns { stop(), done } where `done` resolves when a non-looping sound ends.
 */
export function play(spec, { loop = false, volume = state.settings.volume, short = state.settings.azanLength === 'short' } = {}) {
  spec = spec || { kind: 'tone' };
  let current = null;
  let stopped = false;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const fallback = () => {
    if (stopped) return;
    if (spec.kind === 'youtube') toast(t('sound.fallback'));
    current = chime({ loop, volume });
    current.done?.then(resolveDone);
  };
  const start = (c) => { current = c; c.done?.then(resolveDone); };

  if (spec.kind === 'azan') {
    const id = spec.id || 'makkah';
    const file = short && HAS_SHORT.has(id) ? `${id}-short` : short && id === 'makkah-fajr' ? 'makkah-short' : id;
    start(audioEl(`assets/azan/${file}.mp3`, { loop, volume, onFail: fallback }));
  } else if (spec.kind === 'file' && spec.path) {
    start(audioEl(`media://file/${encodeURIComponent(spec.path)}`, { loop, volume, onFail: fallback }));
  } else if (spec.kind === 'youtube') {
    start(youtube(spec.url, { loop, volume, onFail: fallback }));
  } else {
    current = chime({ loop, volume });
    current.done?.then(resolveDone);
  }
  return {
    stop() { stopped = true; current?.stop(); resolveDone(); },
    done,
  };
}

export function soundLabel(spec) {
  if (!spec || spec.kind === 'tone') return t('sound.tone');
  if (spec.kind === 'azan') return `${t('sound.azan')} · ${t(`sound.voices.${spec.id}`)}`;
  if (spec.kind === 'file') return spec.name || t('sound.file');
  if (spec.kind === 'youtube') return 'YouTube';
  return '';
}
