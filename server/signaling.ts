import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import * as map from 'lib0/map';
import { WebSocketServer, type WebSocket } from 'ws';

export const SIGNALING_WS_PATH =
  process.env.VITE_SIGNALING_PATH?.trim() ||
  process.env.SIGNALING_PATH?.trim() ||
  '/webrtc-signaling';

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const pingTimeout = 30_000;

interface SignalingMessage {
  type?: string;
  topics?: string[];
  topic?: string;
  clients?: number;
}

function normalizePath(pathname: string | null | undefined): string {
  if (!pathname) return '/';
  const withoutQuery = pathname.split('?')[0] ?? '/';
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function pathsMatch(requestPath: string | null | undefined, expectedPath: string): boolean {
  return normalizePath(requestPath) === normalizePath(expectedPath);
}

function createSignalingCore() {
  const wss = new WebSocketServer({ noServer: true });
  const topics = new Map<string, Set<WebSocket>>();

  const send = (conn: WebSocket, message: SignalingMessage): void => {
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

  const onconnection = (conn: WebSocket): void => {
    const subscribedTopics = new Set<string>();
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
        const subs = topics.get(topicName);
        subs?.delete(conn);
        if (subs && subs.size === 0) {
          topics.delete(topicName);
        }
      });
      subscribedTopics.clear();
      closed = true;
    });

    conn.on('message', (raw) => {
      let message: SignalingMessage;
      try {
        if (typeof raw === 'string' || raw instanceof Buffer) {
          message = JSON.parse(raw.toString()) as SignalingMessage;
        } else {
          return;
        }
      } catch {
        return;
      }

      if (!message.type || closed) return;

      switch (message.type) {
        case 'subscribe':
          (message.topics ?? []).forEach((topicName) => {
            if (typeof topicName !== 'string') return;
            const topic = map.setIfUndefined(topics, topicName, () => new Set<WebSocket>());
            topic.add(conn);
            subscribedTopics.add(topicName);
          });
          break;
        case 'unsubscribe':
          (message.topics ?? []).forEach((topicName) => {
            topics.get(topicName)?.delete(conn);
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
    });
  };

  wss.on('connection', onconnection);

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  };

  return {
    handleUpgrade,
    handleHttpRequest(_request: IncomingMessage, response: ServerResponse): boolean {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('okay');
      return true;
    },
  };
}

/** HTTP 서버에 시그널링 WebSocket 경로를 붙입니다. */
export function attachSignalingToHttpServer(
  server: Server,
  options: { path?: string } = {},
): {
  path: string;
  handleHttpRequest: (request: IncomingMessage, response: ServerResponse) => boolean;
} {
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
