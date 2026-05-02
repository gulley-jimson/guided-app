const { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain, desktopCapturer, globalShortcut, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { autoUpdater } = require('electron-updater');
let activeWin = null;
try {
  activeWin = require('active-win');
} catch (err) {
  console.warn('[guided] active-win unavailable:', err?.message);
}

const isDev = !app.isPackaged;
const WIN_WIDTH = 380;
const WIN_HEIGHT = 600;
const WIN_MIN_WIDTH = 320;
const WIN_MIN_HEIGHT = 400;
const WIN_MAX_WIDTH = 800;
const EDGE_MARGIN = 20;

let win = null;
let tray = null;
let isQuitting = false;

let activeAppPollTimer = null;
let lastActiveApp = null;
let positionSaveTimer = null;
let pendingDeepLink = null;

// ---------- guided:// custom protocol ----------

if (process.defaultApp) {
  // Dev mode — register the script entry point so the OS can re-launch us.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('guided', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('guided');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Another launch happened — usually because the user clicked guided:// in the browser.
    // Surface our window and process the URL.
    showWindow();
    const url = findDeepLinkUrl(commandLine);
    if (url) handleAuthDeepLink(url);
  });
}

app.on('open-url', (event, url) => {
  // macOS delivers protocol URLs through this event.
  event.preventDefault();
  if (url) handleAuthDeepLink(url);
});

function findDeepLinkUrl(args) {
  if (!Array.isArray(args)) return null;
  return args.find((a) => typeof a === 'string' && a.startsWith('guided://')) || null;
}

function handleAuthDeepLink(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }
  if (parsed.protocol !== 'guided:') return;
  if (parsed.hostname !== 'auth-callback') return;

  const token = parsed.searchParams.get('token');
  if (!token) return;

  const payload = {
    token,
    userId: parsed.searchParams.get('userId') || null,
    email: parsed.searchParams.get('email') || null,
    plan: parsed.searchParams.get('plan') || null,
  };

  if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    showWindow();
    win.webContents.send('auth:deep-link', payload);
  } else {
    // Window isn't ready yet — buffer until createWindow runs.
    pendingDeepLink = payload;
  }
}

function createWindow() {
  const { x, y, width, height } = resolveInitialState();

  win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: WIN_MIN_WIDTH,
    minHeight: WIN_MIN_HEIGHT,
    maxWidth: WIN_MAX_WIDTH,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#0f0f13',
    title: 'Guided',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  function scheduleStateSave() {
    if (positionSaveTimer) clearTimeout(positionSaveTimer);
    positionSaveTimer = setTimeout(saveWindowState, 500);
  }
  win.on('move', scheduleStateSave);
  win.on('resize', scheduleStateSave);

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.once('did-finish-load', () => {
    if (pendingDeepLink) {
      win.webContents.send('auth:deep-link', pendingDeepLink);
      pendingDeepLink = null;
    }
  });
}

function clampWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return WIN_WIDTH;
  return Math.min(Math.max(Math.round(value), WIN_MIN_WIDTH), WIN_MAX_WIDTH);
}

function clampHeight(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return WIN_HEIGHT;
  return Math.max(Math.round(value), WIN_MIN_HEIGHT);
}

function defaultWindowState() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WIN_WIDTH - EDGE_MARGIN,
    y: workArea.y + Math.round((workArea.height - WIN_HEIGHT) / 2),
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
  };
}

function resolveInitialState() {
  const saved = loadWindowState();
  const dflt = defaultWindowState();

  const width = clampWidth(saved?.width ?? dflt.width);
  const height = clampHeight(saved?.height ?? dflt.height);

  let x = dflt.x;
  let y = dflt.y;
  if (
    saved &&
    typeof saved.x === 'number' &&
    typeof saved.y === 'number' &&
    isPositionVisible(saved.x, saved.y, width, height)
  ) {
    x = saved.x;
    y = saved.y;
  } else if (width !== dflt.width) {
    // If we picked up a saved size but no usable saved position, shift x so the
    // window still hugs the right edge for its new width.
    const { workArea } = screen.getPrimaryDisplay();
    x = workArea.x + workArea.width - width - EDGE_MARGIN;
  }

  return { x, y, width, height };
}

function positionFilePath() {
  return path.join(app.getPath('userData'), 'window-position.json');
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(positionFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const out = {};
    if (typeof parsed.x === 'number' && Number.isFinite(parsed.x)) out.x = parsed.x;
    if (typeof parsed.y === 'number' && Number.isFinite(parsed.y)) out.y = parsed.y;
    if (typeof parsed.width === 'number' && Number.isFinite(parsed.width)) out.width = parsed.width;
    if (typeof parsed.height === 'number' && Number.isFinite(parsed.height)) out.height = parsed.height;
    return Object.keys(out).length > 0 ? out : null;
  } catch {}
  return null;
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();
    fs.writeFileSync(positionFilePath(), JSON.stringify({ x, y, width, height }), 'utf8');
  } catch {}
}

function isPositionVisible(x, y, w, h) {
  for (const display of screen.getAllDisplays()) {
    const wa = display.workArea;
    const overlapX = Math.max(0, Math.min(x + w, wa.x + wa.width) - Math.max(x, wa.x));
    const overlapY = Math.max(0, Math.min(y + h, wa.y + wa.height) - Math.max(y, wa.y));
    // Require at least a 80x80 region of the window to be on a real display.
    if (overlapX >= 80 && overlapY >= 80) return true;
  }
  return false;
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && !win.isMinimized()) win.hide();
  else showWindow();
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'icons', 'tray.png');
  let icon;
  try {
    if (fs.existsSync(trayIconPath)) {
      icon = nativeImage.createFromPath(trayIconPath);
    }
  } catch {}
  if (!icon || icon.isEmpty()) {
    icon = nativeImage.createFromBuffer(makeTrayIconPng());
  }
  tray = new Tray(icon);
  tray.setToolTip('Guided');

  const menu = Menu.buildFromTemplate([
    { label: 'Show Guided', click: showWindow },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

ipcMain.on('window:hide', () => {
  if (win) win.hide();
});

ipcMain.on('window:minimize', () => {
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.handle('window:always-on-top:get', () => {
  return Boolean(win && !win.isDestroyed() && win.isAlwaysOnTop());
});

ipcMain.handle('window:always-on-top:set', (_event, enabled) => {
  if (!win || win.isDestroyed()) return false;
  if (enabled) {
    win.setAlwaysOnTop(true, 'floating');
  } else {
    win.setAlwaysOnTop(false);
  }
  return win.isAlwaysOnTop();
});

ipcMain.handle('app:get', () => lastActiveApp);

// ---- Settings + project folders ----

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
let projectsBasePath = path.join(app.getPath('userData'), 'projects');
let settingsLoaded = false;

const PROJECT_ID_RE = /^[a-z0-9_-]+$/i;
const SAFE_FILENAME_RE = /^[^\\/:*?"<>|]+$/;
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function loadSettings() {
  if (settingsLoaded) return;
  settingsLoaded = true;
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data.projectsBasePath === 'string' && data.projectsBasePath.trim()) {
      projectsBasePath = data.projectsBasePath;
    }
  } catch {}
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(
      SETTINGS_FILE,
      JSON.stringify({ projectsBasePath }, null, 2),
      'utf8'
    );
  } catch {}
}

function projectFolderPath(projectId) {
  if (typeof projectId !== 'string' || !PROJECT_ID_RE.test(projectId)) {
    throw new Error('Invalid project id');
  }
  return path.join(projectsBasePath, projectId);
}

function attachmentsFolderPath(projectId) {
  return path.join(projectFolderPath(projectId), 'attachments');
}

function sanitizeBaseName(name) {
  if (typeof name !== 'string') return '';
  const stem = name.replace(/\.[^.]+$/, '');
  return stem.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || '';
}

ipcMain.handle('projects:getBase', () => {
  loadSettings();
  return projectsBasePath;
});

ipcMain.handle('projects:chooseBase', async () => {
  if (!win || win.isDestroyed()) return null;
  loadSettings();
  try {
    fs.mkdirSync(projectsBasePath, { recursive: true });
  } catch {}
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose where to save Guided projects',
    defaultPath: projectsBasePath,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  projectsBasePath = result.filePaths[0];
  saveSettings();
  return projectsBasePath;
});

ipcMain.handle('projects:ensureFolder', (_event, projectId) => {
  loadSettings();
  try {
    const folder = projectFolderPath(projectId);
    fs.mkdirSync(folder, { recursive: true });
    fs.mkdirSync(path.join(folder, 'attachments'), { recursive: true });
    return folder;
  } catch {
    return null;
  }
});

ipcMain.handle('projects:showInFolder', async (_event, projectId) => {
  loadSettings();
  try {
    const folder = projectFolderPath(projectId);
    fs.mkdirSync(folder, { recursive: true });
    await shell.openPath(folder);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('projects:listFiles', async (_event, projectId) => {
  loadSettings();
  try {
    const folder = attachmentsFolderPath(projectId);
    if (!fs.existsSync(folder)) return [];
    const items = fs.readdirSync(folder, { withFileTypes: true });
    return items
      .filter((it) => it.isFile())
      .map((it) => {
        const full = path.join(folder, it.name);
        let stat;
        try {
          stat = fs.statSync(full);
        } catch {
          return null;
        }
        return {
          name: it.name,
          path: full,
          size: stat.size,
          mtime: stat.mtimeMs,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
});

ipcMain.handle('projects:readImage', async (_event, projectId, fileName) => {
  loadSettings();
  try {
    if (typeof fileName !== 'string' || !SAFE_FILENAME_RE.test(fileName) || fileName.includes('..')) {
      return null;
    }
    const folder = attachmentsFolderPath(projectId);
    const fullPath = path.join(folder, fileName);
    const resolved = path.resolve(fullPath);
    const expectedPrefix = path.resolve(folder);
    if (!resolved.startsWith(expectedPrefix + path.sep) && resolved !== expectedPrefix) {
      return null;
    }
    if (!fs.existsSync(resolved)) return null;
    const ext = path.extname(resolved).slice(1).toLowerCase();
    const mime = EXT_TO_MIME[ext];
    if (!mime) return null;
    const data = fs.readFileSync(resolved).toString('base64');
    return `data:${mime};base64,${data}`;
  } catch {
    return null;
  }
});

ipcMain.handle('projects:saveImage', async (_event, projectId, fileName, dataUrl) => {
  loadSettings();
  try {
    const folder = attachmentsFolderPath(projectId);
    fs.mkdirSync(folder, { recursive: true });
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl ?? '');
    if (!m) return null;
    const mime = m[1].toLowerCase();
    const buffer = Buffer.from(m[2], 'base64');
    const safeBase = sanitizeBaseName(fileName) || 'image';
    const ext =
      MIME_TO_EXT[mime] || path.extname(fileName ?? '').slice(1).toLowerCase() || 'png';
    const finalName = `${Date.now()}-${safeBase}.${ext}`;
    const fullPath = path.join(folder, finalName);
    fs.writeFileSync(fullPath, buffer);
    return { fileName: finalName, path: fullPath, size: buffer.length };
  } catch {
    return null;
  }
});

ipcMain.handle('projects:deleteFolder', async (_event, projectId) => {
  loadSettings();
  try {
    const folder = projectFolderPath(projectId);
    if (!fs.existsSync(folder)) return true;
    fs.rmSync(folder, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('shell:openPath', async (_event, absolutePath) => {
  try {
    if (typeof absolutePath !== 'string' || !absolutePath.trim()) return false;
    const result = await shell.openPath(absolutePath);
    return result === '';
  } catch {
    return false;
  }
});

ipcMain.handle('images:search', async (_event, query) => {
  return searchImagesViaDDG(String(query ?? ''), 3);
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  try {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false, error: 'Invalid URL' };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

ipcMain.handle('pointer:show', (_event, payload) => {
  try {
    if (!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') {
      return { ok: false, error: 'invalid coords' };
    }
    showPointerOverlay(payload.x, payload.y, String(payload.label ?? 'Here'));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

ipcMain.handle('startup:get', () => {
  try {
    return app.getLoginItemSettings().openAtLogin === true;
  } catch {
    return false;
  }
});

ipcMain.handle('startup:set', (_event, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    return app.getLoginItemSettings().openAtLogin === true;
  } catch (err) {
    console.warn('[guided] startup:set failed:', err?.message);
    return false;
  }
});

ipcMain.handle('screen:capture', async () => {
  try {
    const display = screen.getPrimaryDisplay();
    const sf = display.scaleFactor || 1;
    const physW = Math.round(display.size.width * sf);
    const physH = Math.round(display.size.height * sf);

    // Cap the long edge so we don't ship a 4K PNG on every triggered message.
    const MAX_LONG = 1280;
    const longEdge = Math.max(physW, physH);
    const scale = longEdge > MAX_LONG ? MAX_LONG / longEdge : 1;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(physW * scale),
        height: Math.round(physH * scale),
      },
    });

    const primary =
      sources.find((s) => s.display_id === String(display.id)) ?? sources[0];

    if (!primary) {
      return { ok: false, error: 'No screen source available' };
    }

    return { ok: true, dataUrl: primary.thumbnail.toDataURL() };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

ipcMain.handle('env:saveKey', async (_event, value) => {
  try {
    const envPath = path.join(process.cwd(), '.env');
    let existing = '';
    try {
      existing = fs.readFileSync(envPath, 'utf8');
    } catch {}

    const lines = existing ? existing.split(/\r?\n/) : [];
    const newLine = `ANTHROPIC_API_KEY=${value}`;
    let replaced = false;
    const updated = lines.map((line) => {
      if (/^\s*ANTHROPIC_API_KEY\s*=/.test(line)) {
        replaced = true;
        return newLine;
      }
      return line;
    });
    if (!replaced) updated.push(newLine);

    fs.writeFileSync(envPath, updated.join('\n'), 'utf8');
    return { ok: true, path: envPath };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

ipcMain.handle('update:check', () => {
  if (!isDev) autoUpdater.checkForUpdates();
});

ipcMain.handle('app:get-version', () => app.getVersion());

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createTray();
  startActiveAppPolling();
  registerGlobalShortcuts();
  // Auto-updater — checks GitHub releases on startup (production only)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  autoUpdater.on('update-available', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update:available');
    }
  });
  autoUpdater.on('update-downloaded', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update:downloaded');
    }
  });

  // First-launch case on Windows: the OS may have invoked us with the deep-link URL in argv.
  const initialUrl = findDeepLinkUrl(process.argv);
  if (initialUrl) handleAuthDeepLink(initialUrl);
});

app.on('before-quit', () => {
  isQuitting = true;
  stopActiveAppPolling();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

function registerGlobalShortcuts() {
  const ok = globalShortcut.register('Control+Shift+G', toggleWindow);
  if (!ok) {
    console.warn('[guided] Failed to register Ctrl+Shift+G — another app may have it.');
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showWindow();
});

// ---- Tray icon PNG (16x16 indigo rounded square with a white compass dot) ----

function makeTrayIconPng() {
  const W = 16;
  const H = 16;
  const rgba = Buffer.alloc(W * H * 4);

  // Indigo fill (#5763e3) with full alpha.
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4 + 0] = 0x57;
    rgba[i * 4 + 1] = 0x63;
    rgba[i * 4 + 2] = 0xe3;
    rgba[i * 4 + 3] = 0xff;
  }

  // Chamfer the four corners so it reads as a rounded badge in the tray.
  const corners = [
    [0, 0], [1, 0], [0, 1],
    [W - 1, 0], [W - 2, 0], [W - 1, 1],
    [0, H - 1], [1, H - 1], [0, H - 2],
    [W - 1, H - 1], [W - 2, H - 1], [W - 1, H - 2],
  ];
  for (const [x, y] of corners) {
    rgba[(y * W + x) * 4 + 3] = 0;
  }

  // White 2x2 center dot — readable on dark and light tray backgrounds.
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) {
    const i = (y * W + x) * 4;
    rgba[i + 0] = 0xff;
    rgba[i + 1] = 0xff;
    rgba[i + 2] = 0xff;
  }

  return encodePng(W, H, rgba);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = 1 + width * 4;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---- Active app polling ----

const APP_POLL_INTERVAL_MS = 2000;

const APP_NAME_MAP = {
  'code': 'VS Code',
  'visual studio code': 'VS Code',
  'code - insiders': 'VS Code',
  'cursor': 'Cursor',
  'chrome': 'Chrome',
  'google chrome': 'Chrome',
  'msedge': 'Edge',
  'microsoft edge': 'Edge',
  'firefox': 'Firefox',
  'safari': 'Safari',
  'arc': 'Arc',
  'brave browser': 'Brave',
  'brave': 'Brave',
  'slack': 'Slack',
  'notion': 'Notion',
  'spotify': 'Spotify',
  'discord': 'Discord',
  'figma': 'Figma',
  'blender': 'Blender',
  'winword': 'Word',
  'word': 'Word',
  'microsoft word': 'Word',
  'excel': 'Excel',
  'microsoft excel': 'Excel',
  'powerpnt': 'PowerPoint',
  'powerpoint': 'PowerPoint',
  'microsoft powerpoint': 'PowerPoint',
  'outlook': 'Outlook',
  'microsoft outlook': 'Outlook',
  'terminal': 'Terminal',
  'windowsterminal': 'Terminal',
  'windows terminal': 'Terminal',
  'powershell': 'PowerShell',
  'pwsh': 'PowerShell',
  'cmd': 'Command Prompt',
  'photoshop': 'Photoshop',
  'illustrator': 'Illustrator',
  'premierepro': 'Premiere Pro',
  'afterfx': 'After Effects',
  'indesign': 'InDesign',
  'lightroom': 'Lightroom',
  'audition': 'Audition',
  'animate': 'Animate',
  'postman': 'Postman',
  'zoom': 'Zoom',
  'obs64': 'OBS',
  'obs': 'OBS',
  'unity': 'Unity',
  'unityhub': 'Unity Hub',
  'godot': 'Godot',
  'webstorm64': 'WebStorm',
  'idea64': 'IntelliJ',
  'pycharm64': 'PyCharm',
};

function friendlyAppName(rawName) {
  if (!rawName) return null;
  const cleaned = rawName.replace(/\.exe$/i, '').trim();
  if (!cleaned) return null;

  const lc = cleaned.toLowerCase();
  if (APP_NAME_MAP[lc]) return APP_NAME_MAP[lc];

  // Adobe products: "Adobe Photoshop 2025" → "Photoshop"
  const adobe = /^Adobe\s+(.+?)(?:\s+\d{4}(?:\.\d+)*)?$/i.exec(cleaned);
  if (adobe) return adobe[1].trim();

  // Microsoft prefix: "Microsoft Word" → "Word"
  if (/^Microsoft\s+/i.test(cleaned)) {
    return cleaned.replace(/^Microsoft\s+/i, '').trim();
  }

  // Strip trailing version/year (e.g. "WebStorm 2024.3.1")
  const stripped = cleaned.replace(/\s+\d{4}(?:\.\d+)*$/, '').trim();
  const out = stripped || cleaned;
  return out.length > 24 ? out.slice(0, 24).trimEnd() + '…' : out;
}

function isSelfApp(rawName) {
  if (!rawName) return false;
  const lc = rawName.toLowerCase().replace(/\.exe$/i, '');
  return lc === 'electron' || lc === 'guided';
}

async function pollActiveApp() {
  if (!activeWin) return;
  try {
    const result = await activeWin();
    const rawName = result?.owner?.name;
    if (isSelfApp(rawName)) return;

    const friendly = friendlyAppName(rawName);
    if (friendly !== lastActiveApp) {
      lastActiveApp = friendly;
      if (win && !win.isDestroyed()) {
        win.webContents.send('app:changed', friendly);
      }
    }
  } catch {
    // Swallow — keep polling on the next tick.
  }
}

function startActiveAppPolling() {
  if (!activeWin) return;
  pollActiveApp();
  activeAppPollTimer = setInterval(pollActiveApp, APP_POLL_INTERVAL_MS);
}

function stopActiveAppPolling() {
  if (activeAppPollTimer) {
    clearInterval(activeAppPollTimer);
    activeAppPollTimer = null;
  }
}

// ---- Image search (DuckDuckGo, unofficial) ----

const DDG_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
};

async function searchImagesViaDDG(query, count) {
  if (!query) return [];
  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const html = await fetch(searchUrl, { headers: DDG_HEADERS }).then((r) => r.text());

    const vqdMatch =
      html.match(/vqd=['"]([^'"]+)['"]/) ||
      html.match(/vqd=([\d-]+)/) ||
      html.match(/"vqd"\s*:\s*"([^"]+)"/);
    if (!vqdMatch) {
      console.warn('[guided] DDG vqd token not found');
      return [];
    }
    const vqd = vqdMatch[1];

    const apiUrl =
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}` +
      `&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`;
    const res = await fetch(apiUrl, {
      headers: {
        ...DDG_HEADERS,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: 'https://duckduckgo.com/',
      },
    });
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    return results.slice(0, count).map((r) => ({
      thumbUrl: typeof r.thumbnail === 'string' ? r.thumbnail : '',
      url: typeof r.image === 'string' ? r.image : '',
      title: typeof r.title === 'string' ? r.title : '',
      source: typeof r.url === 'string' ? r.url : '',
    })).filter((x) => x.thumbUrl);
  } catch (err) {
    console.warn('[guided] image search failed:', err?.message);
    return [];
  }
}

// ---- Pointer overlay ----

const POINTER_DURATION_MS = 3100;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPointerHtml(px, py, label) {
  return `<!doctype html><html><head><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none;font-family:-apple-system,system-ui,'Segoe UI',sans-serif}
  .callout{position:absolute;left:0;top:0;width:0;height:0;opacity:0;animation:fade ${POINTER_DURATION_MS}ms ease-out forwards}
  @keyframes fade{0%{opacity:0}8%{opacity:1}88%{opacity:1}100%{opacity:0}}
  .arrow{position:absolute;animation:bob 0.85s ease-in-out infinite alternate;transform-origin:50% 100%;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.45))}
  @keyframes bob{0%{transform:translate(-50%,0)}100%{transform:translate(-50%,-9px)}}
  .label{position:absolute;background:rgba(35,39,54,0.96);color:#e6e8eb;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:500;white-space:nowrap;border:1px solid rgba(122,162,255,0.45);box-shadow:0 6px 22px rgba(0,0,0,0.45);max-width:60vw;overflow:hidden;text-overflow:ellipsis}
</style></head><body>
  <div class="callout">
    <svg class="arrow" id="arrow" width="28" height="42" viewBox="0 0 28 42">
      <path d="M14 40 L4 26 L10 26 L10 4 L18 4 L18 26 L24 26 Z" fill="#7aa2ff" stroke="rgba(255,255,255,0.85)" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
    <div class="label" id="label">${escapeHtml(label)}</div>
  </div>
  <script>
    (function(){
      const X = ${px};
      const Y = ${py};
      const arrow = document.getElementById('arrow');
      const label = document.getElementById('label');
      // Place arrow with tip at (X, Y - 4); arrow body extends 42px upward.
      arrow.style.left = X + 'px';
      arrow.style.top = (Y - 46) + 'px';
      // Default: label below + right of target. Flip toward edges.
      const lw = 220, lh = 32;
      const screenW = window.innerWidth, screenH = window.innerHeight;
      let lx = X + 18;
      let ly = Y + 14;
      if (lx + lw > screenW - 8) lx = X - 18 - lw;
      if (ly + lh > screenH - 8) ly = Y - 56 - lh;
      if (lx < 8) lx = 8;
      if (ly < 8) ly = 8;
      label.style.left = lx + 'px';
      label.style.top = ly + 'px';
    })();
  </script>
</body></html>`;
}

function showPointerOverlay(normX, normY, label) {
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;

  const overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setIgnoreMouseEvents(true);
  overlay.setAlwaysOnTop(true, 'screen-saver');

  const px = Math.round(normX * bounds.width);
  const py = Math.round(normY * bounds.height);

  const html = buildPointerHtml(px, py, label);
  overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  overlay.once('ready-to-show', () => overlay.showInactive());

  setTimeout(() => {
    if (!overlay.isDestroyed()) {
      overlay.destroy();
    }
  }, POINTER_DURATION_MS + 200);
}
