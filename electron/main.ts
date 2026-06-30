import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from 'electron';
import path from 'path';
import { APP_CONFIG } from './app-config.ts';
import { loadEnvFromAppRoot } from '../config/loadEnv.ts';
import {
  getActiveServerPort,
  isServerRunning,
  startServer,
  stopServer,
} from '../server/startServer.ts';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let serverPort: number | null = null;

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

function resolveTrayIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(resolveIconPath());
  if (icon.isEmpty()) return icon;
  return icon.resize({ width: 16, height: 16 });
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
    icon: iconPath,
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

  const running = isServerRunning();
  serverPort = getActiveServerPort();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Stop Server',
      enabled: running,
      click: () => {
        void handleStopServer();
      },
    },
    {
      label: 'Start Server',
      enabled: !running,
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
    running && serverPort
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
    console.error('[WhiteBoard4Share] stop server failed:', err);
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
    console.error('[WhiteBoard4Share] start server failed:', err);
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
      console.error('[WhiteBoard4Share] stop server on exit failed:', err);
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

  serverPort = await startServer();
  const iconPath = resolveIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: APP_CONFIG.title,
    autoHideMenuBar: true,
    show: false,
    icon: iconPath,
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
  });

  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

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
  Menu.setApplicationMenu(null);
  createSplashWindow();
  void createWindow().catch((err) => {
    closeSplashWindow();
    console.error('[WhiteBoard4Share] startup failed:', err);
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
      console.error('[WhiteBoard4Share] startup failed:', err);
      void requestQuit();
    });
    return;
  }

  showMainWindow();
});
