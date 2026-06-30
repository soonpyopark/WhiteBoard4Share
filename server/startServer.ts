import http from 'node:http';
import express from 'express';
import path from 'path';
import type { Server } from 'node:http';
import { DEFAULT_PORT, parsePort } from '../config/ports.ts';
import { createApiApp } from './createApp.ts';
import { getDistDir } from './paths.ts';
import { attachYjsSyncToHttpServer, YJS_WS_PATH } from './yjs-sync.ts';

let serverInstance: Server | null = null;
let activePort: number | null = null;

export function isServerRunning(): boolean {
  return serverInstance !== null;
}

export function getActiveServerPort(): number | null {
  return activePort;
}

export async function startServer(options?: { port?: number; hostname?: string }): Promise<number> {
  const distDir = getDistDir();
  const app = express();

  app.use(createApiApp());
  app.use(express.static(distDir));
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  const preferredPort = options?.port ?? parsePort(process.env.PORT, DEFAULT_PORT);
  const hostname = options?.hostname ?? (process.env.HOSTNAME?.trim() || '127.0.0.1');

  const listen = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const server = http.createServer(app);
      attachYjsSyncToHttpServer(server, { path: YJS_WS_PATH });

      server.listen(port, hostname, () => {
        const address = server.address();
        const actualPort =
          typeof address === 'object' && address ? address.port : port;
        serverInstance = server;
        activePort = actualPort;
        resolve(actualPort);
      });

      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && port !== 0) {
          listen(0).then(resolve).catch(reject);
          return;
        }
        reject(error);
      });
    });

  return listen(preferredPort);
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
