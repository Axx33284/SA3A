// WinIsland main process: the island window, the settings app, the tray icon,
// settings storage and the bridge to the Windows helper.
'use strict';
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, Notification, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const Settings = require('./src/shared/settings');
const Core = require('./src/shared/core');
const { Helper } = require('./lib/helper');
const { Demo } = require('./lib/demo');

const argv = process.argv.slice(1);
const DEMO = argv.includes('--demo') || process.env.WINISLAND_DEMO === '1' || process.platform !== 'win32';
const TEST = process.env.WINISLAND_TEST === '1';
const START_HIDDEN = argv.includes('--hidden');

if (process.platform === 'win32') app.setAppUserModelId('com.winisland.app');
if (process.env.WINISLAND_USER_DATA) app.setPath('userData', process.env.WINISLAND_USER_DATA);

if (!TEST && !app.requestSingleInstanceLock()) { app.quit(); }

// ---------------- Settings ----------------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = Settings.normalize({});
let saveTimer = null;

function loadSettings() {
  try { settings = Settings.normalize(JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); }
  catch { settings = Settings.normalize({}); }
}

function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
      const tmp = settingsFile() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
      fs.renameSync(tmp, settingsFile());
    } catch (e) { log('save settings: ' + e.message); }
  }, 250);
}

function updateSettings(patch) {
  const before = settings;
  settings = Settings.merge(settings, patch);
  saveSettings();
  broadcast('settings', settings);
  if (['position', 'display', 'offsetX', 'offsetY', 'scale'].some(k => before[k] !== settings[k])) placeIsland();
  if (before.startWithWindows !== settings.startWithWindows) applyLoginItem();
  if (before.hideInFullscreen !== settings.hideInFullscreen) applyFullscreen();
  if (before.dnd !== settings.dnd) buildTrayMenu();
  return settings;
}

function log(s) { if (!TEST || process.env.WINISLAND_DEBUG) console.log('[winisland]', s); }

// ---------------- Live state (cached so a reloaded window can catch up) ----------------
const live = {
  media: null, thumbs: {}, history: [], power: null, privacy: { mic: [], cam: [] },
  volume: null, notifStatus: { mode: 'starting', detail: '' }, fullscreen: false, helper: null
};

// ---------------- Windows ----------------
let island = null, settingsWin = null, tray = null;
let source = null;

function islandDisplay() {
  const displays = screen.getAllDisplays();
  const cursor = settings.display === 'cursor' ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : null;
  return Core.pickDisplay(settings, displays, screen.getPrimaryDisplay(), cursor);
}

function placeIsland() {
  if (!island || island.isDestroyed()) return;
  const d = islandDisplay();
  const p = Core.placement(settings, d);
  island.setBounds({ x: p.x, y: p.y, width: p.width, height: p.height });
  send(island, 'layout', { vertical: p.vertical, horizontal: p.horizontal, scale: settings.scale, offsetY: settings.offsetY });
}

function createIsland() {
  island = new BrowserWindow({
    width: 520, height: 460, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: true, thickFrame: false,
    title: 'WinIsland',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, sandbox: true }
  });
  island.setAlwaysOnTop(true, 'screen-saver');
  island.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (!TEST) island.setIgnoreMouseEvents(true, { forward: true });
  island.loadFile(path.join(__dirname, 'src', 'island.html'), { query: { test: TEST ? '1' : '0' } });
  island.webContents.on('did-finish-load', () => {
    placeIsland();
    send(island, 'snapshot', snapshot());
    island.showInactive();
  });
  island.on('closed', () => { island = null; });
  placeIsland();
}

function openSettings(section) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show(); settingsWin.focus();
    if (section) send(settingsWin, 'goto', section);
    return settingsWin;
  }
  settingsWin = new BrowserWindow({
    width: 940, height: 680, minWidth: 760, minHeight: 520, show: false,
    title: 'WinIsland Settings', backgroundColor: '#1c1c1e', autoHideMenuBar: true,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (process.platform === 'win32') { try { settingsWin.setBackgroundMaterial('mica'); } catch { } }
  settingsWin.loadFile(path.join(__dirname, 'src', 'settings.html'), { query: section ? { section } : {} });
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
  return settingsWin;
}

function send(win, channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function broadcast(channel, data) { send(island, channel, data); send(settingsWin, channel, data); }

function snapshot() {
  return {
    settings, media: live.media, thumbs: live.thumbs, history: live.history, power: live.power,
    privacy: live.privacy, volume: live.volume, notifStatus: live.notifStatus, demo: DEMO, fullscreen: live.fullscreen
  };
}

// ---------------- Helper / demo source ----------------
function helperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'helper', 'IslandHelper.exe')
    : path.join(__dirname, 'native', 'IslandHelper', 'bin', 'Release', 'net48', 'IslandHelper.exe');
}

function startSource() {
  source = DEMO ? new Demo({ auto: !TEST }) : new Helper(helperPath(), log);
  source.on('message', onSourceMessage);
  source.start();
}

function onSourceMessage(m) {
  switch (m.type) {
    case 'thumb':
      live.thumbs[m.key] = m.data;
      // keep the cache small
      { const keys = Object.keys(live.thumbs); if (keys.length > 40) delete live.thumbs[keys[0]]; }
      break;
    case 'media': live.media = m; break;
    case 'notification':
      live.history.push(m);
      if (live.history.length > 60) live.history.shift();
      rememberApp(m);
      break;
    case 'notification-history':
      live.history = (m.items || []).concat(live.history).slice(-60);
      (m.items || []).forEach(rememberApp);
      break;
    case 'notification-removed': live.history = live.history.filter(n => n.id !== m.id); break;
    case 'power': live.power = m; break;
    case 'privacy': live.privacy = m; break;
    case 'volume': live.volume = m; break;
    case 'notif-status': live.notifStatus = { mode: m.mode, detail: m.detail }; send(settingsWin, 'status', live.notifStatus); break;
    case 'notif-access': send(settingsWin, 'access', m); break;
    case 'fullscreen': live.fullscreen = !!m.value; applyFullscreen(); break;
    case 'hello': live.helper = m; break;
    case 'helper-missing': case 'helper-failed':
      live.notifStatus = { mode: 'unavailable', detail: m.type === 'helper-missing' ? 'IslandHelper.exe is missing: reinstall WinIsland.' : 'The Windows helper keeps crashing.' };
      send(settingsWin, 'status', live.notifStatus);
      break;
  }
  send(island, 'event', m);
}

function rememberApp(n) {
  if (!n || !n.appId) return;
  const name = Core.appInfo(n.appId, n.app).name;
  if (settings.knownApps[n.appId] !== name) {
    settings = Settings.merge(settings, { knownApps: { [n.appId]: name } });
    saveSettings();
    send(settingsWin, 'settings', settings);
  }
}

function applyFullscreen() {
  if (!island || island.isDestroyed() || TEST) return;
  const hide = settings.hideInFullscreen && live.fullscreen;
  if (hide && island.isVisible()) island.hide();
  else if (!hide && !island.isVisible()) island.showInactive();
}

// ---------------- Tray ----------------
function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'src', 'assets', 'tray.png'));
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function buildTrayMenu() {
  if (!tray) return;
  const timer = min => ({ label: `${min} minutes`, click: () => send(island, 'action', { type: 'timer-start', minutes: min }) });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'WinIsland', enabled: false },
    { type: 'separator' },
    { label: 'Settings…', click: () => openSettings() },
    { label: 'Do not disturb', type: 'checkbox', checked: settings.dnd, click: i => updateSettings({ dnd: i.checked }) },
    { label: 'Start a timer', submenu: [1, 5, 10, 15, 25, 60].map(timer) },
    { label: 'Stopwatch', click: () => send(island, 'action', { type: 'stopwatch-toggle' }) },
    { type: 'separator' },
    { label: 'Quit WinIsland', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

function createTray() {
  if (TEST) return;
  tray = new Tray(trayIcon());
  tray.setToolTip('WinIsland');
  tray.on('click', () => openSettings());
  buildTrayMenu();
}

function applyLoginItem() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try { app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, args: ['--hidden'] }); } catch (e) { log('login item: ' + e.message); }
}

// ---------------- IPC ----------------
const ALLOWED_EXTERNAL = /^(ms-settings:[a-z-]*|https:\/\/github\.com\/axx33284\/sa3a.*)$/i;
const HELPER_COMMANDS = new Set(['media', 'media-refresh', 'notif-dismiss', 'notif-clear', 'open-app', 'volume-set', 'volume-mute', 'notif-request-access']);

ipcMain.on('island:interactive', (e, on) => {
  if (island && !island.isDestroyed() && e.sender === island.webContents && !TEST) {
    island.setIgnoreMouseEvents(!on, { forward: true });
  }
});
ipcMain.on('island:command', (e, cmd) => {
  if (!cmd || !HELPER_COMMANDS.has(cmd.cmd) || !source) return;
  source.send(cmd);
  if (cmd.cmd === 'notif-dismiss') { live.history = live.history.filter(n => n.id !== cmd.id); }
  if (cmd.cmd === 'notif-clear') { live.history = []; }
});
ipcMain.on('island:open-settings', (e, section) => openSettings(section));
ipcMain.handle('settings:get', () => ({
  settings, version: app.getVersion(), demo: DEMO, status: live.notifStatus, platform: process.platform,
  displays: screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: `Display ${i + 1} — ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' (main)' : ''}` })),
  history: live.history.slice(-30)
}));
ipcMain.handle('settings:set', (e, patch) => updateSettings(patch));
ipcMain.handle('settings:reset', () => {
  const keep = { onboarded: true, knownApps: settings.knownApps };
  settings = Settings.normalize(keep); saveSettings(); broadcast('settings', settings); placeIsland(); applyLoginItem();
  return settings;
});
ipcMain.on('settings:preview', (e, kind) => {
  if (source && source.trigger && ['notification', 'charging', 'unplug', 'low-battery', 'volume', 'device', 'mic'].includes(kind)) { source.trigger(kind); return; }
  send(island, 'preview', kind);
});
ipcMain.on('settings:test-notification', () => {
  if (DEMO || !Notification.isSupported()) { if (source && source.trigger) source.trigger('notification'); else send(island, 'preview', 'notification'); return; }
  new Notification({ title: 'Hello from WinIsland 👋', body: 'If you can read this in the island, notifications are working.', silent: true }).show();
});
ipcMain.on('settings:open-external', (e, url) => { if (typeof url === 'string' && ALLOWED_EXTERNAL.test(url)) shell.openExternal(url); });
ipcMain.on('settings:request-access', () => { if (source) source.send({ cmd: 'notif-request-access' }); });

// ---------------- App lifecycle ----------------
app.on('second-instance', () => openSettings());
app.on('window-all-closed', e => { /* keep running in the tray */ });

app.whenReady().then(() => {
  loadSettings();
  createIsland();
  createTray();
  startSource();
  applyLoginItem();
  if (!settings.onboarded && !START_HIDDEN && !TEST) { openSettings('welcome'); }
  screen.on('display-metrics-changed', placeIsland);
  screen.on('display-added', placeIsland);
  screen.on('display-removed', placeIsland);
  setInterval(() => {
    if (settings.display === 'cursor') placeIsland();
    // Windows can push the taskbar or a fullscreen app above us; keep the island on top.
    if (island && !island.isDestroyed() && island.isVisible()) island.setAlwaysOnTop(true, 'screen-saver');
  }, 1500);
  powerMonitor.on('resume', () => { if (source) source.send({ cmd: 'media-refresh' }); placeIsland(); });
});

app.on('before-quit', () => { if (source) source.stop(); });

// For the UI tests (Playwright drives the app through these).
if (TEST) {
  global.__winisland = {
    trigger: (kind, data) => source && source.trigger && source.trigger(kind, data),
    openSettings: section => { openSettings(section); return true; },
    update: patch => updateSettings(patch),
    snapshot
  };
}
