import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, powerMonitor, protocol, safeStorage, shell, systemPreferences, Tray } from 'electron';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LockState } from './lock';

const APP_ORIGIN = 'app://authenticator';
const DEFAULT_API = process.env.AUTH_API_URL ?? (app.isPackaged ? 'https://authenticator.sz4h.com/api' : 'http://localhost:8080/api');
const HOUR = 3_600_000;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

const webRoot = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '../../web/dist');
const assets = app.isPackaged ? join(process.resourcesPath, 'build') : join(__dirname, '../build');
const configPath = () => join(app.getPath('userData'), 'config.json');
const sessionPath = () => join(app.getPath('userData'), 'session.bin');

interface Config { apiUrl: string; lockTimeoutMs: number }
function readConfig(): Config {
  try { return { apiUrl: DEFAULT_API, lockTimeoutMs: HOUR, ...JSON.parse(readFileSync(configPath(), 'utf8')) }; } catch { return { apiUrl: DEFAULT_API, lockTimeoutMs: HOUR }; }
}
let config: Config;
const saveConfig = () => writeFileSync(configPath(), JSON.stringify(config));

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let lock: LockState;

function emitLock() { win?.webContents.send('lock:locked'); }
function checkLock() { if (lock.check()) emitLock(); }

function createWindow() {
  win = new BrowserWindow({
    width: 440, height: 760, minWidth: 360, minHeight: 520, show: false,
    backgroundColor: '#0e1116', title: 'Space Authenticator',
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setContentProtection(true); // keep codes out of screenshots / screen sharing
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(APP_ORIGIN)) e.preventDefault(); });
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = null; });
  void win.loadURL(`${APP_ORIGIN}/index.html`);
}

function serveWeb() {
  const csp = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'";
  protocol.handle('app', async req => {
    const { pathname } = new URL(req.url);
    let file = normalize(join(webRoot, decodeURIComponent(pathname)));
    if (!file.startsWith(webRoot + sep) || !existsSync(file)) file = join(webRoot, 'index.html');
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    if (file.endsWith('.html')) headers.set('Content-Security-Policy', csp);
    return new Response(res.body, { status: res.status, headers });
  });
}

function registerIpc() {
  ipcMain.handle('config:getApiUrl', () => config.apiUrl);
  ipcMain.handle('config:setApiUrl', (_e, u: unknown) => {
    if (typeof u !== 'string' || !/^https?:\/\/[^\s]+$/.test(u)) throw new Error('Invalid URL');
    config.apiUrl = u.replace(/\/+$/, ''); saveConfig();
  });
  ipcMain.handle('session:get', () => {
    try { return safeStorage.decryptString(readFileSync(sessionPath())); } catch { return null; }
  });
  ipcMain.handle('session:set', (_e, t: unknown) => {
    if (t === null) { rmSync(sessionPath(), { force: true }); return; }
    if (typeof t !== 'string' || t.length > 500) throw new Error('Invalid token');
    if (!safeStorage.isEncryptionAvailable()) return; // ponytail: no OS keychain (some Linux) → session lasts until restart
    writeFileSync(sessionPath(), safeStorage.encryptString(t), { mode: 0o600 });
  });
  ipcMain.handle('lock:canBiometric', () => process.platform === 'darwin' && systemPreferences.canPromptTouchID());
  ipcMain.handle('lock:biometric', async () => {
    if (process.platform !== 'darwin' || !systemPreferences.canPromptTouchID()) return false;
    try { await systemPreferences.promptTouchID('unlock your authenticator codes'); lock.unlock(); return true; } catch { return false; }
  });
  // Password path (Windows/Linux): the renderer proves the password to the API before calling this.
  ipcMain.handle('lock:markUnlocked', () => { lock.unlock(); });
  ipcMain.handle('lock:isLocked', () => { checkLock(); return lock.locked; });
  ipcMain.handle('lock:getTimeout', () => config.lockTimeoutMs);
  ipcMain.handle('lock:setTimeout', (_e, ms: unknown) => {
    if (typeof ms !== 'number' || ms < 0 || ms > 24 * HOUR) throw new Error('Invalid timeout');
    config.lockTimeoutMs = ms; lock.timeoutMs = ms; saveConfig();
  });
}

function createTray() {
  // macOS: monochrome template icon tinted by the menu bar; Windows/Linux: full-colour logo
  const img = nativeImage.createFromPath(join(assets, process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('Space Authenticator');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Space Authenticator', click: () => (win ? win.show() : createWindow()) },
    { label: 'Lock now', click: () => { lock.locked = true; emitLock(); } },
    { type: 'separator' },
    { role: 'quit' },
  ]));
}

app.whenReady().then(() => {
  config = readConfig();
  lock = new LockState(config.lockTimeoutMs);
  serveWeb();
  registerIpc();
  createWindow();
  createTray();
  setInterval(checkLock, 15_000);
  app.on('browser-window-focus', checkLock);
  powerMonitor.on('resume', checkLock);
  powerMonitor.on('lock-screen', () => { if (!lock.locked) { lock.locked = true; emitLock(); } });
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('activate', () => { if (!win) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
