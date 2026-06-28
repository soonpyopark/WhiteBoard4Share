import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawingEngine } from '../engine/drawingEngine.ts';
import type { TableObject } from '../engine/types.ts';
import type { WhiteboardDocument } from '../types/whiteboard.ts';
import {
  captureEngineScene,
  waitForCollabBootstrap,
} from '../lib/collab/bootstrap.ts';
import {
  createCollabSession,
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

export interface YjsWhiteboardState {
  remotePeerCount: number;
  isWsConnected: boolean;
  isSynced: boolean;
  isReady: boolean;
  hasUnsharedChanges: boolean;
  roomId: string;
  sharedPathCount: number;
  collabSession: CollabSession | null;
  bindEngine: (engine: DrawingEngine, serverDoc: WhiteboardDocument) => Promise<void>;
  markUnsharedChanges: () => void;
  shareScene: () => boolean;
  publishTableUpsert: (table: TableObject) => boolean;
  publishSceneEvents: (events: SceneWriteEvent[]) => boolean;
  reconnect: () => void;
}

export function useYjsWhiteboard(whiteboardId: string, byDept: string): YjsWhiteboardState {
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
    bootstrappedRef.current = false;
    boundEngineRef.current = null;
    setIsReady(false);
    setHasUnsharedChanges(false);

    const session = createCollabSession(whiteboardId, byDept);
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
  }, [whiteboardId, byDept, updateCounts, refreshSharedPathCount]);

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

  const publishTableUpsert = useCallback((table: TableObject): boolean => {
    const session = sessionRef.current;
    const mirror = mirrorRef.current;
    if (!session || !mirror) return false;

    mirror.publishTableUpsert(table);
    updateCounts(session);
    return true;
  }, [updateCounts]);

  const publishSceneEvents = useCallback((events: SceneWriteEvent[]): boolean => {
    const session = sessionRef.current;
    const mirror = mirrorRef.current;
    if (!session || !mirror || events.length === 0) return false;

    mirror.publishSceneEvents(events);
    updateCounts(session);
    return true;
  }, [updateCounts]);

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
    roomId: collabSession?.roomId ?? '',
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
