import http from 'node:http';
import os from 'node:os';
import express from 'express';
import path from 'path';
import type { Server } from 'node:http';
import { DEFAULT_PORT, parsePort } from '../config/ports.ts';
import {
  hostnameForWebServerMode,
  resolveWebServerMode,
  resolveWebServerPort,
  webServerModeForHostname,
  type WebServerMode,
} from '../shared/webServerConfig.ts';
import { createApiApp } from './createApp.ts';
import { ipAccessGuard } from './ipAccessGuard.ts';
import { getDistDir } from './paths.ts';
import { loadSettings, updateSettings } from './settingsService.ts';
import { attachYjsSyncToHttpServer, YJS_WS_PATH } from './yjs-sync.ts';

let serverInstance: Server | null = null;
let activePort: number | null = null;
let activeHostname = '127.0.0.1';
let restarting = false;

export type ServerInfo = {
  running: boolean;
  port: number | null;
  configuredPort: number;
  mode: WebServerMode;
  hostname: string;
  addresses: string[];
  appUrl: string | null;
  canControl: boolean;
};

export function isServerRunning(): boolean {
  return serverInstance !== null;
}

export function getActiveServerPort(): number | null {
  return activePort;
}

export function getActiveHostname(): string {
  return activeHostname;
}

export function getLocalIPv4Addresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

async function resolveListenOptions(options?: {
  port?: number;
  hostname?: string;
}): Promise<{ port: number; hostname: string; mode: WebServerMode }> {
  const settings = await loadSettings();
  const port =
    options?.port ??
    resolveWebServerPort(settings.webServerPort, process.env.PORT);
  const mode = options?.hostname
    ? webServerModeForHostname(options.hostname)
    : resolveWebServerMode(settings.webServerMode, process.env.HOSTNAME);
  const hostname = options?.hostname ?? hostnameForWebServerMode(mode);
  return { port, hostname, mode };
}

function buildApp(): express.Express {
  const distDir = getDistDir();
  const app = express();
  app.use(ipAccessGuard);
  app.use(createApiApp());
  app.use(express.static(distDir));
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
  return app;
}

function listenOn(
  app: express.Express,
  port: number,
  hostname: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    attachYjsSyncToHttpServer(server, { path: YJS_WS_PATH });

    server.listen(port, hostname, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      serverInstance = server;
      activePort = actualPort;
      activeHostname = hostname;
      resolve(actualPort);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && port !== 0) {
        listenOn(app, 0, hostname).then(resolve).catch(reject);
        return;
      }
      reject(error);
    });
  });
}

export async function startServer(options?: {
  port?: number;
  hostname?: string;
}): Promise<number> {
  if (serverInstance) {
    await stopServer();
  }

  const { port, hostname } = await resolveListenOptions(options);
  const app = buildApp();
  return listenOn(app, port, hostname);
}

export async function stopServer(): Promise<void> {
  if (!serverInstance) return;

  await new Promise<void>((resolve, reject) => {
    serverInstance!.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  serverInstance = null;
  activePort = null;
}

export async function getServerInfo(): Promise<ServerInfo> {
  const settings = await loadSettings();
  const configuredPort = resolveWebServerPort(settings.webServerPort, process.env.PORT);
  const mode = serverInstance
    ? webServerModeForHostname(activeHostname)
    : resolveWebServerMode(settings.webServerMode, process.env.HOSTNAME);
  const hostname = serverInstance ? activeHostname : hostnameForWebServerMode(mode);
  const port = activePort;
  const addresses = getLocalIPv4Addresses();
  const appUrl =
    port != null
      ? mode === 'lan'
        ? `http://127.0.0.1:${port}`
        : `http://127.0.0.1:${port}`
      : null;

  return {
    running: serverInstance !== null,
    port,
    configuredPort,
    mode,
    hostname,
    addresses,
    appUrl,
    canControl: true,
  };
}

export async function applyListenConfig(patch: {
  port?: number;
  mode?: WebServerMode;
}): Promise<{ restarted: boolean; info: ServerInfo }> {
  if (restarting) {
    throw new Error('서버 설정을 적용하는 중입니다. 잠시 후 다시 시도하세요.');
  }

  const settings = await loadSettings();
  const nextPort =
    patch.port ?? resolveWebServerPort(settings.webServerPort, process.env.PORT);
  const nextMode =
    patch.mode ??
    resolveWebServerMode(settings.webServerMode, process.env.HOSTNAME);
  const nextHostname = hostnameForWebServerMode(nextMode);

  await updateSettings({
    webServerPort: nextPort,
    webServerMode: nextMode,
  });

  const same =
    serverInstance != null &&
    activePort === nextPort &&
    activeHostname === nextHostname;

  if (same) {
    return { restarted: false, info: await getServerInfo() };
  }

  restarting = true;
  try {
    await stopServer();
    await startServer({ port: nextPort, hostname: nextHostname });
    return { restarted: true, info: await getServerInfo() };
  } finally {
    restarting = false;
  }
}

/** Used when caller only needs env fallback without settings file. */
export function parsePreferredPort(value?: string): number {
  return parsePort(value, DEFAULT_PORT);
}
