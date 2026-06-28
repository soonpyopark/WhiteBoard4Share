import { useCallback, useEffect, useRef } from 'react';
import type { WhiteboardSummary } from '../types/whiteboard';
import {
  createGalleryCollabSession,
  destroyCollabSession,
  type CollabSession,
} from '../lib/collab/doc-manager.ts';
import {
  observeGalleryCreates,
  observeGalleryDeletes,
  observeGalleryVisibility,
  publishGalleryCreate,
  publishGalleryDelete,
  publishGalleryVisibility,
  readGalleryDeletedIds,
} from '../lib/collab/gallery-sync.ts';

export function useGalleryCollab(
  byDept: string,
  enabled: boolean,
  onRemoteDelete: (whiteboardId: string) => void,
  onRemoteCreate: (board: WhiteboardSummary) => void,
  onRemoteVisibility: (board: WhiteboardSummary) => void,
  onDeletedIdsChange: (deletedIds: string[]) => void,
) {
  const sessionRef = useRef<CollabSession | null>(null);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const onRemoteDeleteRef = useRef(onRemoteDelete);
  const onRemoteCreateRef = useRef(onRemoteCreate);
  const onRemoteVisibilityRef = useRef(onRemoteVisibility);
  const onDeletedIdsChangeRef = useRef(onDeletedIdsChange);

  useEffect(() => {
    onRemoteDeleteRef.current = onRemoteDelete;
  }, [onRemoteDelete]);

  useEffect(() => {
    onRemoteCreateRef.current = onRemoteCreate;
  }, [onRemoteCreate]);

  useEffect(() => {
    onRemoteVisibilityRef.current = onRemoteVisibility;
  }, [onRemoteVisibility]);

  useEffect(() => {
    onDeletedIdsChangeRef.current = onDeletedIdsChange;
  }, [onDeletedIdsChange]);

  const syncDeletedTombstones = useCallback((session: CollabSession) => {
    deletedIdsRef.current = readGalleryDeletedIds(session.ydoc);
    onDeletedIdsChangeRef.current(Array.from(deletedIdsRef.current));
  }, []);

  useEffect(() => {
    if (!enabled || !byDept.trim()) {
      deletedIdsRef.current = new Set();
      return;
    }

    deletedIdsRef.current = new Set();
    const session = createGalleryCollabSession(byDept);
    sessionRef.current = session;
    const provider = session.wsProvider;

    const unobserveDeletes = observeGalleryDeletes(session.ydoc, (whiteboardId) => {
      deletedIdsRef.current.add(whiteboardId);
      onDeletedIdsChangeRef.current(Array.from(deletedIdsRef.current));
      onRemoteDeleteRef.current(whiteboardId);
    });
    const unobserveCreates = observeGalleryCreates(session.ydoc, (board) => {
      if (deletedIdsRef.current.has(board.id)) return;
      onRemoteCreateRef.current(board);
    });
    const unobserveVisibility = observeGalleryVisibility(session.ydoc, (board) => {
      if (deletedIdsRef.current.has(board.id)) return;
      onRemoteVisibilityRef.current(board);
    });

    const onSync = (synced: boolean) => {
      if (!synced) return;
      syncDeletedTombstones(session);
    };

    provider.on('sync', onSync);
    if (provider.synced) {
      syncDeletedTombstones(session);
    }

    return () => {
      provider.off('sync', onSync);
      unobserveDeletes();
      unobserveCreates();
      unobserveVisibility();
      void destroyCollabSession(session);
      sessionRef.current = null;
      deletedIdsRef.current = new Set();
    };
  }, [byDept, enabled, syncDeletedTombstones]);

  const publishDelete = useCallback((whiteboardId: string): boolean => {
    const session = sessionRef.current;
    if (!session) return false;
    deletedIdsRef.current.add(whiteboardId);
    publishGalleryDelete(session.ydoc, whiteboardId);
    return true;
  }, []);

  const publishCreate = useCallback((board: WhiteboardSummary): boolean => {
    const session = sessionRef.current;
    if (!session) return false;
    publishGalleryCreate(session.ydoc, board);
    return true;
  }, []);

  const publishVisibility = useCallback((board: WhiteboardSummary): boolean => {
    const session = sessionRef.current;
    if (!session) return false;
    publishGalleryVisibility(session.ydoc, board);
    return true;
  }, []);

  return { publishDelete, publishCreate, publishVisibility };
}
