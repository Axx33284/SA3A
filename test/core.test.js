// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.adhan = require('adhan');

const load = (m) => import(require('path').join(__dirname, '..', 'src', 'js', m));
const BEYLIKDUZU = { lat: 41.0026, lng: 28.64, country: 'TR' };
const hm = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const P = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

test('Diyanet method matches official Beylikdüzü timetable within 1 minute', async () => {
  const { prayerTimes } = await load('prayer.js');
  // Diyanet İşleri Başkanlığı, Beylikdüzü (as republished by NTV).
  const official = {
    '2026-11-03': '06:06 07:32 12:54 15:40 18:06 19:27',
    '2026-11-06': '06:09 07:36 12:54 15:37 18:03 19:24',
  };
  for (const [day, row] of Object.entries(official)) {
    const [y, m, d] = day.split('-').map(Number);
    const { times, methodId } = prayerTimes(new Date(y, m - 1, d), { method: 'auto' }, BEYLIKDUZU);
    assert.equal(methodId, 'Turkey');
    row.split(' ').forEach((t, i) => {
      const diff = Math.abs(mins(hm(times[P[i]])) - mins(t));
      assert.ok(diff <= 1, `${day} ${P[i]}: got ${hm(times[P[i]])}, official ${t}`);
    });
  }
});

// Salatuk's Maghrib runs up to 3 min earlier than Diyanet's official time (17:58 vs 18:01 on 8 Nov), so allow 3.
test('stays within 3 minutes of the Salatuk screenshots', async () => {
  const { prayerTimes } = await load('prayer.js');
  const salatuk = {
    '2026-11-04': '06:06 07:33 12:55 15:39 18:03 19:26',
    '2026-11-05': '06:07 07:35 12:55 15:38 18:02 19:25',
    '2026-11-06': '06:08 07:36 12:55 15:37 18:01 19:24',
    '2026-11-07': '06:09 07:37 12:55 15:36 18:00 19:23',
    '2026-11-08': '06:10 07:38 12:55 15:35 17:58 19:22',
  };
  for (const [day, row] of Object.entries(salatuk)) {
    const [y, m, d] = day.split('-').map(Number);
    const { times } = prayerTimes(new Date(y, m - 1, d), { method: 'auto' }, BEYLIKDUZU);
    row.split(' ').forEach((t, i) => {
      assert.ok(Math.abs(mins(hm(times[P[i]])) - mins(t)) <= 3, `${day} ${P[i]}`);
    });
  }
});

test('per-prayer minute adjustments are applied', async () => {
  const { prayerTimes } = await load('prayer.js');
  const day = new Date(2026, 10, 6);
  const base = prayerTimes(day, { method: 'Turkey' }, BEYLIKDUZU).times;
  const adj = prayerTimes(day, { method: 'Turkey', adjust: { maghrib: -2 } }, BEYLIKDUZU).times;
  assert.equal((adj.maghrib - base.maghrib) / 60000, -2);
  assert.equal(+adj.isha, +base.isha);
});

test('auto method picks the national authority', async () => {
  const { autoMethod, countryFromTimeZone } = await load('prayer.js');
  assert.equal(autoMethod('TR'), 'Turkey');
  assert.equal(autoMethod('SA'), 'UmmAlQura');
  assert.equal(autoMethod('EG'), 'Egyptian');
  assert.equal(autoMethod('XX'), 'MuslimWorldLeague');
  assert.equal(countryFromTimeZone('Europe/Istanbul'), 'TR');
});

test('Hijri date and Ramadan/Eid dates (Umm al-Qura)', async () => {
  const { hijriParts, formatHijri, upcomingEvents } = await load('prayer.js');
  assert.deepEqual(hijriParts(new Date(2026, 10, 4)), { day: 24, month: 5, year: 1448 }); // same as Salatuk
  assert.match(formatHijri(new Date(2026, 10, 4), 'ar'), /24 جمادى الأولى 1448/);
  assert.deepEqual(hijriParts(new Date(2026, 10, 4), 1), { day: 25, month: 5, year: 1448 });
  const ev = Object.fromEntries(upcomingEvents(new Date(2026, 10, 4)).map((e) => [e.id, e.date.toDateString()]));
  assert.equal(ev.ramadan, 'Mon Feb 08 2027');
  assert.equal(ev.eidFitr, 'Tue Mar 09 2027');
  assert.equal(ev.eidAdha, 'Sun May 16 2027');
});

test('Qibla bearing and distance', async () => {
  const { qiblaBearing, distanceKm, greatCirclePath, KAABA } = await load('qibla.js');
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
  near(qiblaBearing(41.0082, 28.9784), 151.6, 0.3); // Istanbul
  near(qiblaBearing(51.5074, -0.1278), 119.0, 0.3); // London
  near(qiblaBearing(40.7128, -74.006), 58.5, 0.3); // New York
  near(qiblaBearing(-6.2088, 106.8456), 295.1, 0.3); // Jakarta
  near(distanceKm(41.0082, 28.9784), 2400, 30);
  const path = greatCirclePath(40.7128, -74.006);
  near(path.at(-1)[0], KAABA.lat, 1e-6);
});
