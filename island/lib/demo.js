// A stand-in for IslandHelper.exe: produces the same messages with made-up media and
// notifications. Used on non-Windows machines, with --demo, and by the UI tests.
'use strict';
const { EventEmitter } = require('events');

function art(c1, c2, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="150" cy="56" r="34" fill="rgba(255,255,255,.28)"/><text x="18" y="182" font-family="Segoe UI,Arial" font-weight="700" font-size="30" fill="rgba(255,255,255,.9)">${label}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const TRACKS = [
  { app: 'Spotify.exe', title: 'Midnight Drive', artist: 'Neon Coast', album: 'City Lights', duration: 214, art: art('#ff2d55', '#5e2bff', 'NC') },
  { app: 'Chrome', title: 'Building a Dynamic Island for Windows', artist: 'Tech Explained', album: '', duration: 754, art: art('#ff0033', '#ff9500', '▶'), kind: 'video' },
  { app: 'Chrome._crx_cinhimbnkkaeohfgghhklpknlkffjgod', title: 'Golden Hour', artist: 'Aurora Fields', album: 'Summer', duration: 189, art: art('#ffcc00', '#ff6b00', 'AF') },
  { app: 'Microsoft.ZuneVideo_8wekyb3d8bbwe!Microsoft.ZuneVideo', title: 'holiday-2025.mp4', artist: '', album: '', duration: 95, art: art('#0a84ff', '#30d158', 'MP4'), kind: 'video' }
];

const NOTIFS = [
  { appId: 'WhatsApp_cv1g1gvanyjgm!App', app: 'WhatsApp', title: 'Sara', body: 'Are we still on for dinner tonight? 🍝' },
  { appId: 'com.squirrel.Discord.Discord', app: 'Discord', title: '#general · Alex', body: 'Just pushed the new build, can someone test it on Windows 11?' },
  { appId: 'Microsoft.OutlookForWindows_8wekyb3d8bbwe!Microsoft.OutlookforWindows', app: 'Outlook', title: 'Project update', body: 'Hi team, the design review moved to Thursday 3 PM. Please bring the latest mock-ups and the timeline.' },
  { appId: 'MSTeams_8wekyb3d8bbwe!MSTeams', app: 'Microsoft Teams', title: 'Daily stand-up', body: 'Meeting starts in 5 minutes' },
  { appId: 'TelegramDesktop', app: 'Telegram', title: 'Mom', body: 'Call me when you are free ❤️' }
];

class Demo extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.auto = opts.auto !== false;
    this.index = 0;
    this.playing = true;
    this.position = 37;
    this.at = Date.now();
    this.nid = 1;
    this.volume = { level: 0.42, muted: false, device: 'Speakers (Realtek Audio)', deviceId: 'spk' };
    this.timers = [];
  }

  available() { return true; }

  start() {
    const e = m => setTimeout(() => this.emit('message', m), 0);
    e({ type: 'hello', version: 'demo', demo: true });
    e({ type: 'notif-status', mode: 'demo', detail: 'Demo data (not running on Windows)' });
    TRACKS.forEach((t, i) => e({ type: 'thumb', key: 'demo' + i, data: t.art }));
    e({ type: 'notification-history', items: NOTIFS.slice(2, 4).map(n => this.notif(n, Date.now() - 1000 * 60 * 23)) });
    e({ type: 'power', hasBattery: true, ac: false, charging: false, percent: 76, saver: false, minutesLeft: 210 });
    e({ type: 'privacy', mic: [], cam: [] });
    e(Object.assign({ type: 'volume' }, this.volume));
    e({ type: 'fullscreen', value: false });
    setTimeout(() => this.emitMedia(), 10);
    if (this.auto) {
      this.timers.push(setInterval(() => this.emitMedia(), 5000));
      this.timers.push(setTimeout(() => this.trigger('notification'), 4000));
      this.timers.push(setInterval(() => this.trigger('notification'), 45000));
    }
  }

  notif(n, time) {
    return Object.assign({ id: 'demo' + (this.nid++), time: time || Date.now(), icon: null, source: 'demo' }, n);
  }

  pos() { return this.position + (this.playing ? (Date.now() - this.at) / 1000 : 0); }

  emitMedia() {
    const t = TRACKS[this.index];
    let p = this.pos();
    if (p >= t.duration) { this.index = (this.index + 1) % TRACKS.length; this.position = 0; this.at = Date.now(); p = 0; }
    const tr = TRACKS[this.index];
    this.emit('message', {
      type: 'media', current: tr.app,
      sessions: [{
        id: tr.app, app: tr.app, title: tr.title, artist: tr.artist, album: tr.album, kind: tr.kind || 'music',
        status: this.playing ? 'playing' : 'paused', position: p, duration: tr.duration, updatedAt: Date.now(), rate: 1,
        canPlay: true, canPause: true, canNext: true, canPrev: true, canSeek: true, canShuffle: true, canRepeat: true,
        shuffle: false, repeat: 'none', thumb: 'demo' + this.index
      }]
    });
  }

  send(cmd) {
    if (cmd.cmd === 'media') {
      const p = this.pos();
      switch (cmd.action) {
        case 'toggle': this.position = p; this.at = Date.now(); this.playing = !this.playing; break;
        case 'play': this.position = p; this.at = Date.now(); this.playing = true; break;
        case 'pause': this.position = p; this.at = Date.now(); this.playing = false; break;
        case 'next': this.index = (this.index + 1) % TRACKS.length; this.position = 0; this.at = Date.now(); break;
        case 'prev':
          if (p > 3) this.position = 0; else { this.index = (this.index + TRACKS.length - 1) % TRACKS.length; this.position = 0; }
          this.at = Date.now(); break;
        case 'seek': this.position = Math.max(0, cmd.position || 0); this.at = Date.now(); break;
      }
      setTimeout(() => this.emitMedia(), 60);
    } else if (cmd.cmd === 'volume-set') {
      this.volume.level = Math.max(0, Math.min(1, cmd.level)); this.emit('message', Object.assign({ type: 'volume' }, this.volume));
    } else if (cmd.cmd === 'volume-mute') {
      this.volume.muted = !this.volume.muted; this.emit('message', Object.assign({ type: 'volume' }, this.volume));
    } else if (cmd.cmd === 'notif-dismiss') {
      this.emit('message', { type: 'notification-removed', id: cmd.id });
    }
    return true;
  }

  // Lets the settings window / tests fire each kind of event on demand.
  trigger(kind, data) {
    const m = msg => this.emit('message', msg);
    switch (kind) {
      case 'notification': {
        const n = NOTIFS[(this.nid - 1) % NOTIFS.length];
        m(Object.assign({ type: 'notification' }, this.notif(n), data || {}));
        break;
      }
      case 'charging': m({ type: 'power', hasBattery: true, ac: true, charging: true, percent: 76, saver: false, minutesLeft: -1 }); break;
      case 'unplug': m({ type: 'power', hasBattery: true, ac: false, charging: false, percent: 76, saver: false, minutesLeft: 200 }); break;
      case 'low-battery': m({ type: 'power', hasBattery: true, ac: false, charging: false, percent: 9, saver: true, minutesLeft: 18 }); break;
      case 'volume': this.volume.level = this.volume.level > 0.7 ? 0.3 : this.volume.level + 0.12; m(Object.assign({ type: 'volume' }, this.volume)); break;
      case 'device':
        this.volume.deviceId = this.volume.deviceId === 'spk' ? 'buds' : 'spk';
        this.volume.device = this.volume.deviceId === 'buds' ? 'Galaxy Buds2 Pro (Bluetooth)' : 'Speakers (Realtek Audio)';
        m(Object.assign({ type: 'volume' }, this.volume)); break;
      case 'mic': m({ type: 'privacy', mic: data === false ? [] : ['Teams'], cam: data === false ? [] : ['Teams'] }); break;
      case 'pause-media': this.send({ cmd: 'media', action: 'pause' }); break;
      case 'play-media': this.send({ cmd: 'media', action: 'play' }); break;
    }
  }

  stop() { this.timers.forEach(t => { clearInterval(t); clearTimeout(t); }); this.timers = []; }
}

module.exports = { Demo, TRACKS, NOTIFS };
