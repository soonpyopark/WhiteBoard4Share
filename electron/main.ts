import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from 'electron';
import path from 'path';
import { APP_CONFIG } from './app-config.ts';
import { DEFAULT_PORT, parsePort } from '../config/ports.ts';
import { loadEnvFromAppRoot } from '../config/loadEnv.ts';
import {
  getActiveServerPort,
  isServerRunning,
  startServer,
  stopServer,
} from '../server/startServer.ts';

const APP_ID = 'com.whiteboard4share.app';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let serverPort: number | null = null;

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

function resolveAppIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(resolveIconPath());
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function applyAppIcon(): void {
  const icon = resolveAppIcon();
  if (icon.isEmpty()) return;

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon);
  }
}

function resolveTrayIcon(): Electron.NativeImage {
  const icon = resolveAppIcon();
  if (icon.isEmpty()) return icon;

  const size = process.platform === 'darwin' ? 18 : 16;
  return icon.resize({ width: size, height: size });
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

  const iconPath = resolveIconPath();
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
    icon: appIcon.isEmpty() ? iconPath : appIcon,
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
  process.env.WHITE_BOARD_DATA_DIR = path.join(appRoot, 'data');
  process.env.ELECTRON_DIST_DIR = resolveDistDir();

  loadEnvFromAppRoot(appRoot);

  if (isElectronDev()) {
    serverPort = parsePort(process.env.PORT, DEFAULT_PORT);
  } else {
    serverPort = await startServer();
  }

  const iconPath = resolveIconPath();
  const appIcon = resolveAppIcon();
  const appUrl = isElectronDev() ? resolveDevServerUrl() : `http://127.0.0.1:${serverPort}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: APP_CONFIG.title,
    autoHideMenuBar: true,
    show: false,
    icon: appIcon.isEmpty() ? iconPath : appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  attachExternalLinkHandler(mainWindow, serverPort);

  mainWindow.once('ready-to-show', () => {
    closeSplashWindow();
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

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }
  applyAppIcon();
  Menu.setApplicationMenu(null);
  createSplashWindow();
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
