import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from './app-config.ts';
import {
  getAutoLaunchState,
  setAutoLaunch,
  START_HIDDEN_ARG,
} from './autoLaunchService.ts';
import { DEFAULT_PORT, parsePort } from '../config/ports.ts';
import { loadEnvFromAppRoot } from '../config/loadEnv.ts';
import {
  getActiveServerPort,
  isServerRunning,
  startServer,
  stopServer,
} from '../server/startServer.ts';
import {
  applyConfiguredDataDirToEnv,
  getDataRootState,
  updateSettings,
} from '../server/settingsService.ts';
import { getAppRoot, getDefaultDataDir } from '../server/paths.ts';
import { applyPortableUserData } from './portableUserData.ts';

applyPortableUserData();

const APP_ID = 'com.whiteboard4share.app';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let serverPort: number | null = null;
const launchedHidden = process.argv.includes(START_HIDDEN_ARG);

function isElectronDev(): boolean {
  return !app.isPackaged && process.env.ELECTRON_DEV === '1';
}

function resolveDevServerUrl(): string {
  return process.env.VITE_DEV_SERVER_URL ?? `http://127.0.0.1:${parsePort(process.env.PORT, DEFAULT_PORT)}`;
}

function resolveElectronDir(): string {
  return path.dirname(__filename);
}

function resolveAppRoot(): string {
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return process.cwd();
}

function resolveDistDir(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist');
  }
  return path.join(process.cwd(), 'dist');
}

function resolveIconPath(): string {
  return path.join(resolveElectronDir(), 'icon.png');
}

function resolveSizedIconPath(fileName: string): string {
  const sizedPath = path.join(resolveElectronDir(), fileName);
  if (fs.existsSync(sizedPath)) return sizedPath;
  return resolveIconPath();
}

function loadNativeIcon(fileName: string): Electron.NativeImage {
  const icon = nativeImage.createFromPath(resolveSizedIconPath(fileName));
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function resolveAppIcon(): Electron.NativeImage {
  return loadNativeIcon('icon-256.png');
}

/** Windows title bar + taskbar: use multi-size .ico (Electron recommendation on win32). */
function resolveWindowIcon(): string | Electron.NativeImage {
  if (process.platform === 'win32') {
    const icoPath = path.join(resolveElectronDir(), 'icon.ico');
    if (fs.existsSync(icoPath)) {
      return icoPath;
    }
  }

  const appIcon = resolveAppIcon();
  return appIcon.isEmpty() ? resolveIconPath() : appIcon;
}

function applyAppIcon(): void {
  const icon = resolveAppIcon();
  if (icon.isEmpty()) return;

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon);
  }
}

function resolveTrayIcon(): Electron.NativeImage {
  return loadNativeIcon('icon-32.png');
}

function isLocalAppUrl(url: string, port: number): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === String(port)
    );
  } catch {
    return false;
  }
}

function attachExternalLinkHandler(window: BrowserWindow, port: number): void {
  const { webContents } = window;

  webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalAppUrl(url, port)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (!isLocalAppUrl(url, port)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function setupSplashExternalLinks(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function showSplashWindow(mode: 'loading' | 'about'): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    if (mode === 'about') {
      splashWindow.focus();
      splashWindow.show();
    }
    return;
  }

  const appIcon = resolveAppIcon();

  splashWindow = new BrowserWindow({
    width: 400,
    height: mode === 'about' ? 130 : 110,
    frame: false,
    alwaysOnTop: mode === 'loading',
    skipTaskbar: mode === 'loading',
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#0a1a33',
    icon: appIcon.isEmpty() ? resolveSizedIconPath('splash-icon.png') : appIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.setMenu(null);
  void splashWindow.loadFile(path.join(resolveElectronDir(), 'splash.html'), {
    query: {
      mode,
      title: APP_CONFIG.title,
      blog: APP_CONFIG.blogUrl,
      version: app.getVersion(),
      author: APP_CONFIG.authorName,
    },
  });

  setupSplashExternalLinks(splashWindow);

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createSplashWindow(): void {
  showSplashWindow('loading');
}

function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function updateTrayMenu(): void {
  if (!tray) return;

  const dev = isElectronDev();
  const running = dev || isServerRunning();
  serverPort = dev ? parsePort(process.env.PORT, DEFAULT_PORT) : getActiveServerPort();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Stop Server',
      enabled: running && !dev,
      click: () => {
        void handleStopServer();
      },
    },
    {
      label: 'Start Server',
      enabled: !running && !dev,
      click: () => {
        void handleStartServer();
      },
    },
    { type: 'separator' },
    {
      label: 'About',
      click: () => {
        showSplashWindow('about');
      },
    },
    {
      label: 'Exit',
      click: () => {
        void requestQuit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(
    dev && serverPort
      ? `${APP_CONFIG.title} — Dev mode (:${serverPort})`
      : running && serverPort
        ? `${APP_CONFIG.title} — Server running (:${serverPort})`
        : `${APP_CONFIG.title} — Server stopped`,
  );
}

function createTray(): void {
  if (tray) return;

  tray = new Tray(resolveTrayIcon());
  tray.setToolTip(APP_CONFIG.title);

  tray.on('double-click', () => {
    showMainWindow();
  });

  updateTrayMenu();
}

async function handleStopServer(): Promise<void> {
  if (!isServerRunning()) {
    updateTrayMenu();
    return;
  }

  try {
    await stopServer();
    serverPort = null;
    updateTrayMenu();
  } catch (err) {
    console.error('[Whiteboard4Share] stop server failed:', err);
    void dialog.showErrorBox('Stop Server', '서버를 중지하지 못했습니다.');
  }
}

async function handleStartServer(): Promise<void> {
  if (isServerRunning()) {
    updateTrayMenu();
    return;
  }

  try {
    const port = await startServer();
    serverPort = port;
    updateTrayMenu();

    if (mainWindow && !mainWindow.isDestroyed()) {
      attachExternalLinkHandler(mainWindow, port);
      await mainWindow.loadURL(`http://127.0.0.1:${port}`);
      showMainWindow();
    }
  } catch (err) {
    console.error('[Whiteboard4Share] start server failed:', err);
    void dialog.showErrorBox('Start Server', '서버를 시작하지 못했습니다.');
    updateTrayMenu();
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindowToTray(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
}

async function requestQuit(): Promise<void> {
  isQuitting = true;
  closeSplashWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
  }

  if (isServerRunning()) {
    try {
      await stopServer();
    } catch (err) {
      console.error('[Whiteboard4Share] stop server on exit failed:', err);
    }
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }

  app.quit();
}

async function createWindow(): Promise<void> {
  const appRoot = resolveAppRoot();
  process.env.ELECTRON_APP_ROOT = appRoot;
  process.env.ELECTRON_DIST_DIR = resolveDistDir();

  loadEnvFromAppRoot(appRoot);
  const dataDir = await applyConfiguredDataDirToEnv();
  console.log(`[data] dataDir=${dataDir}`);

  if (isElectronDev()) {
    serverPort = parsePort(process.env.PORT, DEFAULT_PORT);
  } else {
    serverPort = await startServer();
  }

  const appUrl = isElectronDev() ? resolveDevServerUrl() : `http://127.0.0.1:${serverPort}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: APP_CONFIG.title,
    autoHideMenuBar: true,
    show: false,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(resolveElectronDir(), 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  attachExternalLinkHandler(mainWindow, serverPort);

  mainWindow.once('ready-to-show', () => {
    closeSplashWindow();
    if (launchedHidden) {
      // Stay in tray when started from login item with --hidden.
      return;
    }
    mainWindow?.show();
    if (isElectronDev()) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  await mainWindow.loadURL(appUrl);

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideMainWindowToTray();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTray();
  updateTrayMenu();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

ipcMain.handle('app:getPaths', async () => {
  const state = await getDataRootState();
  return {
    appRoot: getAppRoot(),
    defaultDataRoot: state.defaultDataRoot,
    dataRoot: state.effective,
    configuredDataRoot: state.configured,
  };
});

ipcMain.handle('dialog:pickDirectory', async (event, options: { title?: string } = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  const dialogOptions: Electron.OpenDialogOptions = {
    title: typeof options?.title === 'string' ? options.title : '데이터 디렉터리 선택',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('settings:applyDataRoot', async (_event, rawPath: string | null = null) => {
  const appRoot = getAppRoot();
  let configured: string | null =
    typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : null;

  if (configured) {
    configured = path.isAbsolute(configured)
      ? path.normalize(configured)
      : path.resolve(appRoot, configured);
    await fs.promises.mkdir(configured, { recursive: true });
  }

  await updateSettings({ dataRoot: configured });
  const state = await getDataRootState();

  setImmediate(() => {
    isQuitting = true;
    app.relaunch();
    app.exit(0);
  });

  return {
    ok: true,
    willRelaunch: true,
    configured: state.configured,
    effective: configured ?? getDefaultDataDir(),
    defaultDataRoot: state.defaultDataRoot,
  };
});

ipcMain.handle('app:relaunch', async () => {
  setImmediate(() => {
    isQuitting = true;
    app.relaunch();
    app.exit(0);
  });
  return { ok: true, willRelaunch: true };
});

ipcMain.handle('app:getAutoLaunch', () => getAutoLaunchState());

ipcMain.handle(
  'app:setAutoLaunch',
  (_event, options: { enabled?: boolean; startHidden?: boolean } = {}) => {
    const current = getAutoLaunchState();
    return setAutoLaunch(
      options.enabled ?? current.enabled,
      options.startHidden ?? current.startHidden,
    );
  },
);

if (!gotSingleInstanceLock) {
  app.whenReady().then(() => {
    dialog.showMessageBoxSync({
      type: 'info',
      title: APP_CONFIG.title,
      message: '이미 프로그램이 실행 중입니다.',
      buttons: ['확인'],
    });
    app.quit();
  });
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId(APP_ID);
    }
    applyAppIcon();
    Menu.setApplicationMenu(null);
    if (!launchedHidden) {
      createSplashWindow();
    }
    void createWindow().catch((err) => {
      closeSplashWindow();
      console.error('[Whiteboard4Share] startup failed:', err);
      void requestQuit();
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    closeSplashWindow();
  });

  app.on('window-all-closed', () => {
    if (isQuitting) return;
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createSplashWindow();
      void createWindow().catch((err) => {
        closeSplashWindow();
        console.error('[Whiteboard4Share] startup failed:', err);
        void requestQuit();
      });
      return;
    }

    showMainWindow();
  });
}
