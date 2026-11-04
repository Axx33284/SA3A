// UI test: starts WinIsland with demo data, drives every island state and the settings
// window, checks the DOM and saves screenshots to test/screenshots/.
// Run: xvfb-run -a node scripts/e2e.js   (needs the `playwright` package)
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const root = path.join(__dirname, '..');
const shots = path.join(root, 'test', 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'winisland-e2e-'));
  const app = await electron.launch({
    executablePath: require(path.join(root, 'node_modules', 'electron')),
    args: [root, '--no-sandbox', '--demo'],
    env: Object.assign({}, process.env, { WINISLAND_TEST: '1', WINISLAND_DEMO: '1', WINISLAND_USER_DATA: userData })
  });
  const errors = [];
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push('island: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('island console: ' + m.text()); });
  await page.waitForFunction(() => window.__island && window.__island.S.ready);
  await wait(900);

  const view = () => page.evaluate(() => document.getElementById('island').dataset.view);
  const shot = async (name, clip) => {
    await wait(750);
    await page.screenshot({ path: path.join(shots, name + '.png'), clip: clip || { x: 0, y: 0, width: 520, height: 300 } });
    console.log('  saved', name);
  };
  const results = [];
  const check = (name, cond) => { results.push([name, !!cond]); console.log((cond ? '  ok   ' : '  FAIL ') + name); };

  // 1. compact now-playing (demo starts with a playing Spotify track)
  check('compact view while media plays', (await view()) === 'compact');
  check('album art in compact view', await page.$('#cLead img.art'));
  await shot('01-compact-media', { x: 100, y: 0, width: 320, height: 70 });

  // 2. hover expands to the media player
  await page.hover('#island');
  await wait(800);
  check('hover expands the island', (await view()) === 'expanded');
  check('media pane is shown', await page.$eval('.p-media', el => el.classList.contains('active')));
  const title = await page.textContent('#mTitle');
  check('title shown: ' + title, title === 'Midnight Drive');
  await shot('02-expanded-media');

  // 3. pause from the island
  await page.click('#mPlay');
  await wait(400);
  const status = await page.evaluate(() => window.__island.S.sessions[0].status);
  check('pause button pauses playback', status === 'paused');
  await page.click('#mPlay');

  // 4. seek by clicking the progress bar at 75%
  const bar = await page.$('#mBar');
  const bb = await bar.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.75, bb.y + bb.height / 2);
  await wait(400);
  const pos = await page.evaluate(() => { const s = window.__island.S.sessions[0]; return s.position / s.duration; });
  check('seek moves playback to ~75% (' + pos.toFixed(2) + ')', Math.abs(pos - 0.75) < 0.05);

  // 5. next track
  await page.click('#mNext');
  await wait(400);
  check('next skips the track', (await page.textContent('#mTitle')) !== title);

  // 6. timers tab
  await page.click('[data-tab="timer"]');
  await page.click('[data-act="timer-start"][data-min="5"]');
  await wait(300);
  check('timer starts from the island', await page.evaluate(() => window.__island.S.timers.length === 1));
  await shot('03-expanded-timers', { x: 0, y: 0, width: 520, height: 360 });
  await page.click('[data-tab="home"]');
  await shot('04-expanded-home');

  // collapse: two live activities -> island + bubble
  await page.mouse.move(5, 440);
  await wait(1200);
  check('collapses when the mouse leaves', (await view()) === 'compact');
  check('second activity shows as a bubble', await page.$eval('#bubble', el => el.classList.contains('show')));
  await shot('05-compact-plus-bubble', { x: 80, y: 0, width: 360, height: 70 });

  // 7. notification banner
  await app.evaluate(() => global.__winisland.trigger('notification'));
  await wait(300);
  check('notification banner appears', (await view()) === 'notif');
  await shot('06-notification', { x: 40, y: 0, width: 440, height: 130 });
  await page.hover('#island');
  await wait(600);
  check('hover shows notification details', await page.$eval('.v-notif', el => el.classList.contains('detail')));
  await shot('07-notification-detail', { x: 40, y: 0, width: 440, height: 200 });
  await page.click('[data-act="n-dismiss"]');
  await page.mouse.move(5, 440);
  await wait(1200);

  // 8. charging, volume, device, privacy
  await app.evaluate(() => global.__winisland.trigger('charging'));
  await wait(200);
  check('charging alert', (await view()) === 'alert');
  await shot('08-charging', { x: 80, y: 0, width: 360, height: 70 });
  await wait(3600);
  await app.evaluate(() => global.__winisland.trigger('volume'));
  await wait(200);
  await shot('09-volume', { x: 80, y: 0, width: 360, height: 70 });
  await wait(2200);
  await app.evaluate(() => global.__winisland.trigger('device'));
  await wait(200);
  await shot('10-device', { x: 80, y: 0, width: 360, height: 70 });
  await wait(3600);
  await app.evaluate(() => global.__winisland.trigger('mic'));
  await wait(200);
  await shot('11-privacy', { x: 80, y: 0, width: 360, height: 70 });
  await wait(3000);
  await app.evaluate(() => global.__winisland.trigger('mic', false));

  // 9. timer done
  await page.evaluate(() => window.__island.preview('timer-done'));
  await wait(300);
  check('timer done alert', (await view()) === 'big');
  await shot('12-timer-done', { x: 60, y: 0, width: 400, height: 110 });
  await page.click('[data-act="alert-close"]');

  // 10. idle styles + themes + scale + position
  await page.evaluate(() => { const S = window.__island.S; S.timers = []; S.sessions = []; window.__island.render(); });
  await wait(300);
  check('idle when nothing is going on', (await view()) === 'idle');
  await shot('13-idle', { x: 160, y: 0, width: 200, height: 60 });
  await app.evaluate(() => global.__winisland.update({ idleStyle: 'clock', theme: 'light' }));
  await shot('14-idle-clock-light', { x: 160, y: 0, width: 200, height: 60 });
  await app.evaluate(() => global.__winisland.update({ idleStyle: 'pill', theme: 'black', scale: 1.3, position: 'bottom-center' }));
  await wait(400);
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  check('scale + bottom position resize/move the window (' + JSON.stringify(bounds) + ')', bounds.width === Math.round(520 * 1.3));
  await app.evaluate(() => global.__winisland.update({ scale: 1, position: 'top-center' }));

  // 11. settings window
  await app.evaluate(() => global.__winisland.openSettings('welcome'));
  const sw = await app.waitForEvent('window');
  sw.on('pageerror', e => errors.push('settings: ' + e.message));
  await sw.waitForSelector('.sec.on');
  await sw.setViewportSize({ width: 940, height: 680 });
  await wait(500);
  await sw.screenshot({ path: path.join(shots, '20-settings-welcome.png') });
  for (const sec of ['appearance', 'position', 'behavior', 'notifications', 'activities']) {
    await sw.click(`#nav [data-sec="${sec}"]`);
    await wait(350);
    await sw.screenshot({ path: path.join(shots, `2${['appearance', 'position', 'behavior', 'notifications', 'activities'].indexOf(sec) + 1}-settings-${sec}.png`) });
  }
  // change a setting from the settings window and check the island got it
  await sw.click('#nav [data-sec="appearance"]');
  await sw.click('[data-theme="graphite"]');
  await wait(300);
  check('settings window changes the island theme', await page.evaluate(() => document.body.classList.contains('theme-graphite')));
  await sw.click('#nav [data-sec="position"]');
  await sw.click('[data-pos="top-right"]');
  await wait(300);
  check('position picker moves the island', await page.evaluate(() => document.getElementById('stage').className.includes('h-right')));
  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
  check('settings are saved to disk', saved.theme === 'graphite' && saved.position === 'top-right');
  check('apps that sent notifications are listed', Object.keys(saved.knownApps).length > 0);

  check('no page errors (' + errors.join(' | ') + ')', errors.length === 0);
  await app.close();
  const failed = results.filter(r => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
