'use strict';
// SA3A main process: window, tray, storage, notifications, start-with-Windows.
const {
  app, BrowserWindow, Tray, Menu, ipcMain, dialog, Notification, powerMonitor,
  protocol, net, session, shell, nativeImage, nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const APP_ID = 'com.sa3a.app';
const LOGIN_NAME = 'SA3A';
const SRC_DIR = path.join(__dirname, 'src');
// Windows notifications and the tray need real files, not paths inside app.asar.
const ICON = path.join(SRC_DIR, 'assets', 'icon.png').replace('app.asar', 'app.asar.unpacked');
const TRAY_ICON = path.join(SRC_DIR, 'assets', 'tray.png').replace('app.asar', 'app.asar.unpacked');
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac', '.webm']);

app.setAppUserModelId(APP_ID); // Windows needs this for notifications to show the app name/icon.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  // The UI is served from app://sa3a/ (a real origin) so YouTube embeds and ES modules work.
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  // media://file/<encoded path> streams audio files the user picked from disk.
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let tray = null;
let quitting = false;
const launchedHidden = process.argv.includes('--hidden');

// ---------- storage (one JSON file in %APPDATA%\SA3A) ----------
const dataFile = () => path.join(app.getPath('userData'), 'sa3a-data.json');
let data = {};
function loadData() {
  try {
    data = JSON.parse(fs.readFileSync(dataFile(), 'utf8')) || {};
  } catch {
    data = {};
  }
}
let saveTimer = null;
function saveDataSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDataNow, 300);
}
function saveDataNow() {
  clearTimeout(saveTimer);
  try {
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, dataFile()); // atomic replace: a crash never leaves a half-written file
  } catch (err) {
    console.error('save failed', err);
  }
}

// ---------- window ----------
function themeColors() {
  const s = data.settings || {};
  const dark = s.theme === 'light' ? false : s.theme === 'dark' ? true : nativeTheme.shouldUseDarkColors;
  return dark ? { color: '#00000000', symbolColor: '#dbe9ec', bg: '#0a1c22' } : { color: '#00000000', symbolColor: '#16343c', bg: '#eef4f4' };
}

function createWindow() {
  const c = themeColors();
  const bounds = data.windowBounds || {};
  win = new BrowserWindow({
    width: bounds.width || 1120,
    height: bounds.height || 740,
    x: bounds.x,
    y: bounds.y,
    minWidth: 860,
    minHeight: 580,
    show: false,
    title: 'SA3A',
    icon: ICON,
    backgroundColor: c.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: c.color, symbolColor: c.symbolColor, height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // alarms, timers and azan must fire while the window is hidden
      spellcheck: false,
    },
  });
  win.loadURL('app://sa3a/index.html');

  win.once('ready-to-show', () => {
    const hide = launchedHidden && (data.settings?.startHidden ?? true);
    if (!hide) win.show();
  });

  const remember = () => {
    if (!win.isMaximized() && !win.isMinimized()) {
      data.windowBounds = win.getBounds();
      saveDataSoon();
    }
  };
  win.on('resize', remember);
  win.on('move', remember);

  win.on('close', (e) => {
    if (!quitting && (data.settings?.closeToTray ?? true)) {
      e.preventDefault();
      win.hide();
    }
  });

  // Links open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://sa3a/')) e.preventDefault();
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const img = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('SA3A');
  tray.on('click', showWindow);
  updateTrayMenu();
}

function updateTrayMenu(labels = {}) {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: labels.open || 'Open SA3A', click: showWindow },
    { type: 'separator' },
    { label: labels.quit || 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ---------- start with Windows ----------
function setOpenAtLogin(enabled) {
  if (!app.isPackaged) return false; // never register the dev electron.exe
  app.setLoginItemSettings({ openAtLogin: !!enabled, name: LOGIN_NAME, path: process.execPath, args: ['--hidden'] });
  return app.getLoginItemSettings({ name: LOGIN_NAME, path: process.execPath, args: ['--hidden'] }).openAtLogin;
}

// ---------- protocols ----------
function registerProtocols() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(SRC_DIR, decodeURIComponent(pathname)));
    if (!file.startsWith(SRC_DIR + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  protocol.handle('media', (req) => {
    const u = new URL(req.url);
    const file = decodeURIComponent(u.pathname.slice(1));
    if (u.host !== 'file' || !AUDIO_EXT.has(path.extname(file).toLowerCase()) || !fs.existsSync(file)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function configureSession() {
  const ses = session.defaultSession;
  // YouTube refuses to play embeds that arrive without a Referer (error 153). Give it one.
  ses.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*', 'https://*.googlevideo.com/*'] },
    (details, cb) => {
      details.requestHeaders.Referer = 'https://sa3a.app/';
      cb({ requestHeaders: details.requestHeaders });
    },
  );
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['geolocation', 'notifications', 'media', 'fullscreen'].includes(permission));
  });
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.on('store:get-sync', (e) => { e.returnValue = data; });
  ipcMain.handle('store:set', (_e, key, value) => {
    data[key] = value;
    saveDataSoon();
    if (key === 'settings') {
      updateTitleBar();
    }
    return true;
  });
  ipcMain.handle('login:set', (_e, enabled) => setOpenAtLogin(enabled));
  ipcMain.handle('login:get', () => (app.isPackaged
    ? app.getLoginItemSettings({ name: LOGIN_NAME, path: process.execPath, args: ['--hidden'] }).openAtLogin
    : !!data.settings?.startAtLogin));
  ipcMain.handle('win:show', () => showWindow());
  ipcMain.handle('win:flash', () => { if (win && !win.isFocused()) win.flashFrame(true); });
  ipcMain.handle('tray:update', (_e, tooltip, labels) => {
    if (tray) tray.setToolTip(String(tooltip || 'SA3A').slice(0, 127));
    updateTrayMenu(labels || {});
  });
  ipcMain.handle('notify', (_e, { title, body, silent }) => {
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title, body, silent: silent !== false, icon: ICON });
    n.on('click', showWindow);
    n.show();
    return true;
  });
  ipcMain.handle('dialog:audio', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXT].map((x) => x.slice(1)) }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0], name: path.basename(r.filePaths[0]) };
  });
  ipcMain.handle('open:external', (_e, url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged, platform: process.platform }));
  ipcMain.handle('app:quit', () => { quitting = true; app.quit(); });
}

function updateTitleBar() {
  if (!win || process.platform === 'darwin') return;
  const c = themeColors();
  try {
    win.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: 40 });
    win.setBackgroundColor(c.bg);
  } catch { /* overlay not supported on this platform */ }
}

// ---------- lifecycle ----------
app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; saveDataNow(); });

app.whenReady().then(() => {
  loadData();
  registerProtocols();
  configureSession();
  registerIpc();
  createWindow();
  createTray();
  nativeTheme.on('updated', () => {
    updateTitleBar();
    win?.webContents.send('system:theme');
  });
  // After sleep the renderer re-checks alarms, timers and prayers it may have missed.
  powerMonitor.on('resume', () => win?.webContents.send('system:resume'));
  powerMonitor.on('unlock-screen', () => win?.webContents.send('system:resume'));
});

app.on('window-all-closed', () => {
  if (quitting) app.quit();
});
