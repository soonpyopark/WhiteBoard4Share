import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { getYjsWebSocketUrl } from './constants.ts';
import { buildLocalAwarenessUser, getOrCreateLocalUserName } from './presence-user.ts';

export interface CollabSession {
  roomId: string;
  ydoc: Y.Doc;
  wsProvider: WebsocketProvider;
  destroy: () => void;
}

export function roomNameForWhiteboard(whiteboardId: string, byDept: string): string {
  return `wb-${byDept.trim()}-${whiteboardId.trim()}`;
}

export function destroyCollabSession(session: CollabSession): Promise<void> {
  return new Promise((resolve) => {
    session.wsProvider.disconnect();
    session.wsProvider.destroy();
    session.ydoc.destroy();
    setTimeout(resolve, 0);
  });
}

export function createCollabSession(whiteboardId: string, byDept: string): CollabSession {
  const ydoc = new Y.Doc();
  const roomId = roomNameForWhiteboard(whiteboardId, byDept);

  const wsProvider = new WebsocketProvider(getYjsWebSocketUrl(), roomId, ydoc, {
    connect: true,
  });

  const clientId = wsProvider.awareness.clientID;
  wsProvider.awareness.setLocalState({
    ...wsProvider.awareness.getLocalState(),
    user: buildLocalAwarenessUser(clientId, getOrCreateLocalUserName()),
    cursor: null,
  });

  const session: CollabSession = {
    roomId,
    ydoc,
    wsProvider,
    destroy: () => {
      void destroyCollabSession(session);
    },
  };

  return session;
}

export function getConnectedPeerCount(session: CollabSession): number {
  return session.wsProvider.awareness.getStates().size;
}

export function getRemotePeerCount(session: CollabSession): number {
  return Math.max(0, getConnectedPeerCount(session) - 1);
}

export function isWsConnected(session: CollabSession): boolean {
  return session.wsProvider.wsconnected;
}

export function reconnectSession(session: CollabSession): void {
  session.wsProvider.disconnect();
  session.wsProvider.connect();
}
