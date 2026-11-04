const test = require('node:test');
const assert = require('node:assert');
const Settings = require('../src/shared/settings');
const Core = require('../src/shared/core');

test('settings: defaults are complete and valid', () => {
  const s = Settings.normalize({});
  assert.strictEqual(s.position, 'top-center');
  assert.strictEqual(s.scale, 1);
  assert.deepStrictEqual(Object.keys(s.features).sort(), Settings.FEATURES.slice().sort());
  assert.deepStrictEqual(Settings.normalize(s), s, 'normalize is idempotent');
});

test('settings: garbage is replaced, ranges are clamped', () => {
  const s = Settings.normalize({ position: 'middle', scale: 9, offsetY: -5, accent: 'red', theme: 3, mutedApps: ['a', 'a', 5, ''], hoverDelay: 'x' });
  assert.strictEqual(s.position, 'top-center');
  assert.strictEqual(s.scale, 1.6);
  assert.strictEqual(s.offsetY, 0);
  assert.strictEqual(s.accent, '#0a84ff');
  assert.strictEqual(s.theme, 'black');
  assert.deepStrictEqual(s.mutedApps, ['a']);
  assert.strictEqual(s.hoverDelay, 250);
  assert.strictEqual(Settings.normalize(null).position, 'top-center');
});

test('settings: merge keeps nested feature flags', () => {
  const a = Settings.merge({}, { features: { media: false } });
  assert.strictEqual(a.features.media, false);
  assert.strictEqual(a.features.notifications, true);
  const b = Settings.merge(a, { knownApps: { x: 'X' } });
  const c = Settings.merge(b, { knownApps: { y: 'Y' } });
  assert.deepStrictEqual(c.knownApps, { x: 'X', y: 'Y' });
  assert.strictEqual(c.features.media, false);
});

test('apps: known AppUserModelIDs get friendly names', () => {
  assert.strictEqual(Core.appInfo('Spotify.exe').name, 'Spotify');
  assert.strictEqual(Core.appInfo('Chrome').name, 'Google Chrome');
  assert.strictEqual(Core.appInfo('MSEdge').name, 'Microsoft Edge');
  assert.strictEqual(Core.appInfo('308046B0AF4A39CB').name, 'Firefox');
  assert.strictEqual(Core.appInfo('Chrome._crx_cinhimbnkkaeohfgghhklpknlkffjgod').name, 'YouTube Music');
  assert.strictEqual(Core.appInfo('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic').name, 'Media Player');
  assert.strictEqual(Core.appInfo('5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App').name, 'WhatsApp');
});

test('apps: unknown apps use the reported name, or a cleaned-up id', () => {
  assert.strictEqual(Core.appInfo('Contoso.Notes_abcdefghijklm!App', 'Contoso Notes').name, 'Contoso Notes');
  assert.strictEqual(Core.appInfo('Contoso.SuperNotes_abcdefghijklm!App').name, 'Super Notes');
  assert.strictEqual(Core.appInfo('C:\\Program Files\\Foo\\foobar.exe').name, 'Foobar');
  assert.match(Core.appInfo('whatever').color, /^#[0-9a-f]{6}$/);
  assert.strictEqual(Core.appInfo('whatever').color, Core.appInfo('whatever').color, 'stable colour');
});

test('media: live position is extrapolated while playing and clamped', () => {
  const t = 1_000_000;
  const s = { status: 'playing', position: 10, duration: 100, updatedAt: t - 5000, rate: 1 };
  assert.strictEqual(Core.livePosition(s, t), 15);
  assert.strictEqual(Core.livePosition(Object.assign({}, s, { rate: 2 }), t), 20);
  assert.strictEqual(Core.livePosition(Object.assign({}, s, { status: 'paused' }), t), 10);
  assert.strictEqual(Core.livePosition(Object.assign({}, s, { updatedAt: t - 500000 }), t), 100);
  assert.strictEqual(Core.livePosition(null, t), 0);
});

test('media: session choice prefers the pick, then playing, then current', () => {
  const a = { id: 'a', app: 'a', title: 'A', status: 'paused', lastActive: 5 };
  const b = { id: 'b', app: 'b', title: 'B', status: 'playing' };
  const c = { id: 'c', app: 'c', title: 'C', status: 'paused', lastActive: 9 };
  const empty = { id: 'e', app: 'e', title: '', artist: '', status: 'playing' };
  assert.strictEqual(Core.pickSession([a, b, c], 'a').id, 'b');
  assert.strictEqual(Core.pickSession([a, b, c], 'a', 'c').id, 'c');
  assert.strictEqual(Core.pickSession([a, c], 'a').id, 'a');
  assert.strictEqual(Core.pickSession([a, c], null).id, 'c');
  assert.strictEqual(Core.pickSession([empty], null), null);
  assert.strictEqual(Core.pickSession([], null), null);
});

test('time formatting', () => {
  assert.strictEqual(Core.formatTime(0), '0:00');
  assert.strictEqual(Core.formatTime(65.9), '1:05');
  assert.strictEqual(Core.formatTime(3725), '1:02:05');
  assert.strictEqual(Core.relativeTime(1000, 1000 + 10000), 'now');
  assert.strictEqual(Core.relativeTime(0, 5000), 'now');
  assert.strictEqual(Core.relativeTime(1000, 1000 + 5 * 60000), '5m ago');
});

test('live activities: ordering and feature switches', () => {
  const now = 100000;
  const set = Settings.normalize({});
  const media = { status: 'playing', lastActive: now };
  const timers = [{ id: 't', endsAt: now + 5000, total: 6000 }];
  assert.deepStrictEqual(Core.liveActivities({ media, timers }, set, now).map(a => a.kind), ['media', 'timer']);
  assert.deepStrictEqual(Core.liveActivities({ media: Object.assign({}, media, { status: 'paused' }), timers }, set, now).map(a => a.kind), ['timer', 'media']);
  const off = Settings.merge(set, { features: { media: false } });
  assert.deepStrictEqual(Core.liveActivities({ media, timers }, off, now).map(a => a.kind), ['timer']);
  // a paused player disappears after the timeout
  assert.deepStrictEqual(Core.liveActivities({ media: { status: 'paused', lastActive: now - 11 * 60000 } }, set, now), []);
  assert.deepStrictEqual(Core.liveActivities({ stopwatch: { running: true, startedAt: now - 1000, elapsed: 0 } }, set, now).map(a => a.kind), ['stopwatch']);
  assert.deepStrictEqual(Core.liveActivities({ privacy: { mic: ['Teams'], cam: [] } }, set, now).map(a => a.kind), ['privacy']);
});

test('timers and stopwatch maths', () => {
  assert.strictEqual(Core.timerLeft({ endsAt: 5000 }, 3000), 2000);
  assert.strictEqual(Core.timerLeft({ endsAt: 5000 }, 9000), 0);
  assert.strictEqual(Core.timerLeft({ endsAt: 5000, pausedLeft: 1234 }, 9000), 1234);
  assert.strictEqual(Core.stopwatchElapsed({ running: true, startedAt: 1000, elapsed: 500 }, 3000), 2500);
  assert.strictEqual(Core.stopwatchElapsed({ running: false, startedAt: 1000, elapsed: 500 }, 3000), 500);
});

test('placement: positions on the display', () => {
  const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } };
  const base = Settings.normalize({});
  let p = Core.placement(base, display);
  assert.deepStrictEqual([p.x, p.y, p.width, p.height], [(1920 - 520) / 2, 0, 520, 460]);
  p = Core.placement(Settings.merge(base, { position: 'bottom-right' }), display);
  assert.strictEqual(p.x + p.width, 1920 - 12);
  assert.strictEqual(p.y + p.height, 1032, 'bottom positions sit above the taskbar');
  p = Core.placement(Settings.merge(base, { position: 'top-left', scale: 1.5 }), display);
  assert.deepStrictEqual([p.x, p.width, p.height], [12, 780, 690]);
  p = Core.placement(Settings.merge(base, { offsetX: 5000 }), display);
  assert.strictEqual(p.x, 1920 - 520, 'never leaves the screen');
  // second monitor to the left of the main one
  const left = { bounds: { x: -1280, y: 0, width: 1280, height: 1024 }, workArea: { x: -1280, y: 0, width: 1280, height: 984 } };
  p = Core.placement(base, left);
  assert.strictEqual(p.x, -1280 + (1280 - 520) / 2);
});

test('placement: display choice', () => {
  const d1 = { id: 1 }, d2 = { id: 2 };
  assert.strictEqual(Core.pickDisplay({ display: 'primary' }, [d1, d2], d1, null), d1);
  assert.strictEqual(Core.pickDisplay({ display: '2' }, [d1, d2], d1, null), d2);
  assert.strictEqual(Core.pickDisplay({ display: '99' }, [d1, d2], d1, null), d1, 'unplugged monitor falls back to main');
  assert.strictEqual(Core.pickDisplay({ display: 'cursor' }, [d1, d2], d1, d2), d2);
});

test('notifications: muted apps and do-not-disturb', () => {
  const set = Settings.normalize({ mutedApps: ['Spam.App'] });
  assert.strictEqual(Core.shouldBanner({ appId: 'Good.App' }, set), true);
  assert.strictEqual(Core.shouldBanner({ appId: 'Spam.App' }, set), false);
  assert.strictEqual(Core.shouldBanner({ appId: 'Good.App' }, Settings.merge(set, { dnd: true })), false);
  assert.strictEqual(Core.shouldBanner({ appId: 'Good.App' }, Settings.merge(set, { features: { notifications: false } })), false);
});
