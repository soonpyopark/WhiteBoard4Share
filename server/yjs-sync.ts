import { createRequire } from 'node:module';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { getClientIpFromRequest, isIpAllowed } from './ipAllowlist.ts';
import { loadSettings } from './settingsService.ts';

const require = createRequire(import.meta.url);
const { setupWSConnection } = require('y-websocket/bin/utils') as {
  setupWSConnection: (
    conn: import('ws').WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean },
  ) => void;
};

export const YJS_WS_PATH =
  process.env.VITE_YJS_WS_PATH?.trim() ||
  process.env.YJS_WS_PATH?.trim() ||
  '/yjs';

function normalizePath(pathname: string | null | undefined): string {
  if (!pathname) return '/';
  const withoutQuery = pathname.split('?')[0] ?? '/';
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function matchesYjsPath(requestPath: string | null | undefined, basePath: string): boolean {
  const normalized = normalizePath(requestPath);
  const normalizedBase = normalizePath(basePath);
  return normalized === normalizedBase || normalized.startsWith(`${normalizedBase}/`);
}

async function assertWsIpAllowed(request: IncomingMessage): Promise<boolean> {
  try {
    const settings = await loadSettings();
    return isIpAllowed(getClientIpFromRequest(request), settings.allowedIpCidrs);
  } catch (error) {
    console.error('[yjs-sync] ip check failed:', error);
    return true;
  }
}

/** HTTP 서버에 Yjs WebSocket 동기화 경로를 붙입니다. */
export function attachYjsSyncToHttpServer(
  server: Server,
  options: { path?: string } = {},
): {
  path: string;
  handleHttpRequest: (request: IncomingMessage, response: ServerResponse) => boolean;
} {
  const wsPath = options.path ?? YJS_WS_PATH;
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (conn, request: IncomingMessage) => {
    setupWSConnection(conn, request, { gc: true });
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!matchesYjsPath(pathname, wsPath)) {
      return;
    }

    void (async () => {
      if (!(await assertWsIpAllowed(request))) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } catch (error) {
        socket.destroy();
        console.error('[yjs-sync] upgrade failed:', error);
      }
    })();
  });

  return {
    path: wsPath,
    handleHttpRequest(request, response) {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (!matchesYjsPath(pathname, wsPath)) {
        return false;
      }
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('okay');
      return true;
    },
  };
}
