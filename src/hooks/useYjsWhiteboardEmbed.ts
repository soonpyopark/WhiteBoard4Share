import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { DrawingEngine } from '../engine/drawingEngine.ts';
import type { TableObject } from '../engine/types.ts';
import type { WhiteboardDocument } from '../types/whiteboard.ts';
import {
  captureEngineScene,
  waitForCollabBootstrap,
} from '../lib/collab/bootstrap.ts';
import {
  destroyCollabSession,
  getRemotePeerCount,
  isWsConnected,
  reconnectSession,
  type CollabSession,
} from '../lib/collab/doc-manager.ts';
import { YJS_PATHS_KEY } from '../lib/collab/constants.ts';
import { attachYdocMirror, type YdocMirror } from '../lib/collab/mirror.ts';
import { isSceneEmpty } from '../lib/collab/schema.ts';
import type { SceneWriteEvent } from '../lib/collab/scene-events.ts';
import { buildLocalAwarenessUser } from '../lib/collab/presence-user.ts';
import type { YjsWhiteboardState } from './useYjsWhiteboard.ts';

function createEmbedCollabSession(
  roomId: string,
  syncServerUrl: string,
  userName: string,
): CollabSession {
  const ydoc = new Y.Doc();
  const wsProvider = new WebsocketProvider(syncServerUrl, roomId, ydoc, {
    connect: true,
    resyncInterval: 5000,
  });

  const clientId = wsProvider.awareness.clientID;
  wsProvider.awareness.setLocalState({
    ...wsProvider.awareness.getLocalState(),
    user: buildLocalAwarenessUser(clientId, userName),
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

export function useYjsWhiteboardEmbed(
  roomId: string,
  syncServerUrl: string,
  userName: string,
  enabled: boolean,
): YjsWhiteboardState {
  const [remotePeerCount, setRemotePeerCount] = useState(0);
  const [isWsConnectedState, setIsWsConnectedState] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasUnsharedChanges, setHasUnsharedChanges] = useState(false);
  const [sharedPathCount, setSharedPathCount] = useState(0);
  const [collabSession, setCollabSession] = useState<CollabSession | null>(null);

  const sessionRef = useRef<CollabSession | null>(null);
  const mirrorRef = useRef<YdocMirror | null>(null);
  const boundEngineRef = useRef<DrawingEngine | null>(null);
  const bootstrappedRef = useRef(false);

  const refreshSharedPathCount = useCallback((session: CollabSession) => {
    setSharedPathCount(session.ydoc.getMap(YJS_PATHS_KEY).size);
  }, []);

  const updateCounts = useCallback(
    (session: CollabSession) => {
      setRemotePeerCount(getRemotePeerCount(session));
      setIsWsConnectedState(isWsConnected(session));
      setIsSynced(session.wsProvider.synced);
      refreshSharedPathCount(session);
    },
    [refreshSharedPathCount],
  );

  useEffect(() => {
    if (!enabled || !roomId || !syncServerUrl) {
      bootstrappedRef.current = false;
      boundEngineRef.current = null;
      setIsReady(false);
      setHasUnsharedChanges(false);
      setCollabSession(null);
      return undefined;
    }

    bootstrappedRef.current = false;
    boundEngineRef.current = null;
    setIsReady(false);
    setHasUnsharedChanges(false);

    const session = createEmbedCollabSession(roomId, syncServerUrl, userName);
    sessionRef.current = session;
    setCollabSession(session);

    const awareness = session.wsProvider.awareness;
    const provider = session.wsProvider;
    const pathsMap = session.ydoc.getMap(YJS_PATHS_KEY);

    const onAwarenessChange = () => updateCounts(session);
    const onStatus = (event: { status: 'connected' | 'disconnected' | 'connecting' }) => {
      setIsWsConnectedState(event.status === 'connected');
      updateCounts(session);
    };
    const onSync = (synced: boolean) => {
      setIsSynced(synced);
      updateCounts(session);
    };
    const onPathsMapChange = () => refreshSharedPathCount(session);

    awareness.on('change', onAwarenessChange);
    awareness.on('update', onAwarenessChange);
    provider.on('status', onStatus);
    provider.on('sync', onSync);
    pathsMap.observe(onPathsMapChange);
    updateCounts(session);

    const interval = window.setInterval(() => updateCounts(session), 3000);

    return () => {
      awareness.off('change', onAwarenessChange);
      awareness.off('update', onAwarenessChange);
      provider.off('status', onStatus);
      provider.off('sync', onSync);
      pathsMap.unobserve(onPathsMapChange);
      window.clearInterval(interval);
      mirrorRef.current?.dispose();
      mirrorRef.current = null;
      boundEngineRef.current = null;
      bootstrappedRef.current = false;
      void destroyCollabSession(session);
      sessionRef.current = null;
      setCollabSession(null);
    };
  }, [enabled, roomId, syncServerUrl, userName, updateCounts, refreshSharedPathCount]);

  const bindEngine = useCallback(
    async (engine: DrawingEngine, _serverDoc: WhiteboardDocument) => {
      const session = sessionRef.current;
      if (!session) return;
      if (boundEngineRef.current === engine && bootstrappedRef.current) return;

      mirrorRef.current?.dispose();
      const mirror = attachYdocMirror(session.ydoc, engine);
      mirrorRef.current = mirror;
      boundEngineRef.current = engine;

      try {
        if (!bootstrappedRef.current) {
          await waitForCollabBootstrap(session);
          bootstrappedRef.current = true;
        }

        await mirror.syncSharedToEngine();
        mirror.initEmptyTracking();

        const engineScene = captureEngineScene(engine);
        const hasLocalContent =
          engineScene.paths.length > 0 ||
          engineScene.images.length > 0 ||
          engineScene.texts.length > 0 ||
          engineScene.tables.length > 0;
        setHasUnsharedChanges(hasLocalContent && isSceneEmpty(session.ydoc));

        setIsReady(true);
        updateCounts(session);
      } catch (error) {
        if (boundEngineRef.current === engine) {
          boundEngineRef.current = null;
        }
        mirror.dispose();
        if (mirrorRef.current === mirror) {
          mirrorRef.current = null;
        }
        throw error;
      }
    },
    [updateCounts],
  );

  const markUnsharedChanges = useCallback(() => {
    setHasUnsharedChanges(true);
  }, []);

  const shareScene = useCallback((): boolean => {
    const session = sessionRef.current;
    const engine = boundEngineRef.current;
    const mirror = mirrorRef.current;
    if (!session || !engine || !mirror) return false;

    mirror.publishScene(captureEngineScene(engine));
    boundEngineRef.current?.clearDeferredDrawState();
    setHasUnsharedChanges(false);
    updateCounts(session);
    return true;
  }, [updateCounts]);

  const publishTableUpsert = useCallback(
    (table: TableObject): boolean => {
      const session = sessionRef.current;
      const mirror = mirrorRef.current;
      if (!session || !mirror) return false;

      mirror.publishTableUpsert(table);
      updateCounts(session);
      return true;
    },
    [updateCounts],
  );

  const publishSceneEvents = useCallback(
    (events: SceneWriteEvent[]): boolean => {
      const session = sessionRef.current;
      const mirror = mirrorRef.current;
      if (!session || !mirror || events.length === 0) return false;

      mirror.publishSceneEvents(events);
      updateCounts(session);
      return true;
    },
    [updateCounts],
  );

  const reconnect = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    reconnectSession(session);
    window.setTimeout(() => updateCounts(session), 500);
  }, [updateCounts]);

  return {
    remotePeerCount,
    isWsConnected: isWsConnectedState,
    isSynced,
    isReady,
    hasUnsharedChanges,
    roomId: collabSession?.roomId ?? roomId,
    sharedPathCount,
    collabSession,
    bindEngine,
    markUnsharedChanges,
    shareScene,
    publishTableUpsert,
    publishSceneEvents,
    reconnect,
  };
}
