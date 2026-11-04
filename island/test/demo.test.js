// The demo source must speak the same protocol as IslandHelper.exe.
const test = require('node:test');
const assert = require('node:assert');
const { Demo } = require('../lib/demo');

function collect(d) { const msgs = []; d.on('message', m => msgs.push(m)); return msgs; }
const tick = ms => new Promise(r => setTimeout(r, ms));

test('demo emits the helper start-up messages', async () => {
  const d = new Demo({ auto: false });
  const msgs = collect(d);
  d.start();
  await tick(30);
  const types = new Set(msgs.map(m => m.type));
  for (const t of ['hello', 'notif-status', 'thumb', 'notification-history', 'power', 'privacy', 'volume', 'media']) assert.ok(types.has(t), t);
  const media = msgs.find(m => m.type === 'media');
  const s = media.sessions[0];
  for (const k of ['id', 'app', 'title', 'artist', 'status', 'position', 'duration', 'updatedAt', 'canSeek', 'thumb']) assert.ok(k in s, k);
  d.stop();
});

test('demo media commands', async () => {
  const d = new Demo({ auto: false });
  const msgs = collect(d);
  d.start();
  await tick(20);
  const last = () => msgs.filter(m => m.type === 'media').pop().sessions[0];
  d.send({ cmd: 'media', action: 'toggle' }); await tick(80);
  assert.strictEqual(last().status, 'paused');
  d.send({ cmd: 'media', action: 'seek', position: 100 }); await tick(80);
  assert.ok(Math.abs(last().position - 100) < 0.5);
  const t = last().title;
  d.send({ cmd: 'media', action: 'next' }); await tick(80);
  assert.notStrictEqual(last().title, t);
  d.send({ cmd: 'volume-set', level: 0.8 });
  assert.strictEqual(msgs.filter(m => m.type === 'volume').pop().level, 0.8);
  d.stop();
});
