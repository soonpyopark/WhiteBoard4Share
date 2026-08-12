/**
 * WebRTC 시그널링 서버 (y-webrtc 호환)
 * - 앱 서버 통합: attachSignalingToHttpServer() → /webrtc-signaling
 */
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import * as map from 'lib0/map';
import { fileURLToPath } from 'url';

export const SIGNALING_WS_PATH =
  process.env.VITE_SIGNALING_PATH?.trim() ||
  process.env.SIGNALING_PATH?.trim() ||
  '/webrtc-signaling';

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const pingTimeout = 30000;

function normalizePath(pathname) {
  if (!pathname) return '/';
  const withoutQuery = pathname.split('?')[0] ?? '/';
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function pathsMatch(requestPath, expectedPath) {
  return normalizePath(requestPath) === normalizePath(expectedPath);
}

function createSignalingCore() {
  const wss = new WebSocketServer({ noServer: true });
  const topics = new Map();

  const send = (conn, message) => {
    if (
      conn.readyState !== wsReadyStateConnecting &&
      conn.readyState !== wsReadyStateOpen
    ) {
      conn.close();
      return;
    }
    try {
      conn.send(JSON.stringify(message));
    } catch {
      conn.close();
    }
  };

  const onconnection = (conn) => {
    const subscribedTopics = new Set();
    let closed = false;
    let pongReceived = true;

    const pingInterval = setInterval(() => {
      if (!pongReceived) {
        conn.close();
        clearInterval(pingInterval);
      } else {
        pongReceived = false;
        try {
          conn.ping();
        } catch {
          conn.close();
        }
      }
    }, pingTimeout);

    conn.on('pong', () => {
      pongReceived = true;
    });

    conn.on('close', () => {
      subscribedTopics.forEach((topicName) => {
        const subs = topics.get(topicName) || new Set();
        subs.delete(conn);
        if (subs.size === 0) {
          topics.delete(topicName);
        }
      });
      subscribedTopics.clear();
      closed = true;
    });

    conn.on('message', (message) => {
      if (typeof message === 'string' || message instanceof Buffer) {
        message = JSON.parse(message);
      }
      if (message && message.type && !closed) {
        switch (message.type) {
          case 'subscribe':
            (message.topics || []).forEach((topicName) => {
              if (typeof topicName === 'string') {
                const topic = map.setIfUndefined(topics, topicName, () => new Set());
                topic.add(conn);
                subscribedTopics.add(topicName);
              }
            });
            break;
          case 'unsubscribe':
            (message.topics || []).forEach((topicName) => {
              const subs = topics.get(topicName);
              if (subs) {
                subs.delete(conn);
              }
            });
            break;
          case 'publish':
            if (message.topic) {
              const receivers = topics.get(message.topic);
              if (receivers) {
                message.clients = receivers.size;
                receivers.forEach((receiver) => send(receiver, message));
              }
            }
            break;
          case 'ping':
            send(conn, { type: 'pong' });
            break;
          default:
            break;
        }
      }
    });
  };

  wss.on('connection', onconnection);

  const handleUpgrade = (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  };

  return {
    handleUpgrade,
    handleHttpRequest(request, response) {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('okay');
      return true;
    },
  };
}

/** HTTP 서버에 시그널링 WebSocket 경로를 붙입니다. */
export function attachSignalingToHttpServer(server, options = {}) {
  const wsPath = options.path ?? SIGNALING_WS_PATH;
  const core = createSignalingCore();

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!pathsMatch(pathname, wsPath)) {
      return;
    }
    try {
      core.handleUpgrade(request, socket, head);
    } catch (error) {
      socket.destroy();
      console.error('[signaling] upgrade failed:', error);
    }
  });

  return {
    path: wsPath,
    handleHttpRequest(request, response) {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (!pathsMatch(pathname, wsPath)) {
        return false;
      }
      return core.handleHttpRequest(request, response);
    },
  };
}

const isMainModule =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMainModule) {
  const port = Number(process.env.PORT || 3008);
  const hostname = process.env.HOSTNAME?.trim() === '0.0.0.0' ? '0.0.0.0' : 'localhost';
  const core = createSignalingCore();
  const server = http.createServer((request, response) => {
    core.handleHttpRequest(request, response);
  });
  server.on('upgrade', (request, socket, head) => {
    core.handleUpgrade(request, socket, head);
  });
  server.listen(port, hostname, () => {
    console.log(`Signaling server running on ${hostname}:${port}${SIGNALING_WS_PATH}`);
  });
}
