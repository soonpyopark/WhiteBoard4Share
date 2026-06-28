import type * as Y from 'yjs';
import type { WhiteboardDocument, WhiteboardSummary } from '../../types/whiteboard';
import {
  YJS_GALLERY_CREATED_KEY,
  YJS_GALLERY_DELETED_KEY,
  YJS_GALLERY_VISIBILITY_KEY,
} from './constants.ts';
import { LOCAL_ORIGIN } from './schema.ts';
import { clonePlainValue } from './yvalue.ts';

export function documentToSummary(doc: WhiteboardDocument): WhiteboardSummary {
  return {
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    thumbnail: doc.thumbnail,
    shareToken: doc.shareToken,
    isPrivate: doc.isPrivate,
    isViewRestricted: doc.isViewRestricted,
  };
}

/** Yjs 갤러리 이벤트는 썸네일 등이 오래될 수 있음 — API 목록과 병합할 때 사용 */
export function mergeGalleryBoardRemote(
  existing: WhiteboardSummary,
  remote: WhiteboardSummary,
): WhiteboardSummary {
  const existingTime = Date.parse(existing.updatedAt);
  const remoteTime = Date.parse(remote.updatedAt);
  const remoteIsNewer =
    Number.isFinite(existingTime) && Number.isFinite(remoteTime) && remoteTime > existingTime;

  return {
    ...existing,
    isPrivate: remote.isPrivate ?? existing.isPrivate,
    isViewRestricted: remote.isViewRestricted ?? existing.isViewRestricted,
    shareToken: remote.shareToken !== undefined ? remote.shareToken : existing.shareToken,
    ...(remoteIsNewer
      ? {
          title: remote.title,
          createdAt: remote.createdAt,
          updatedAt: remote.updatedAt,
          thumbnail: remote.thumbnail,
        }
      : {}),
  };
}

function isWhiteboardSummary(value: unknown): value is WhiteboardSummary {
  if (!value || typeof value !== 'object') return false;
  const board = value as WhiteboardSummary;
  return (
    typeof board.id === 'string' &&
    board.id.length > 0 &&
    typeof board.title === 'string' &&
    typeof board.createdAt === 'string' &&
    typeof board.updatedAt === 'string'
  );
}

export function readGalleryDeletedIds(ydoc: Y.Doc): Set<string> {
  const deletedMap = ydoc.getMap(YJS_GALLERY_DELETED_KEY);
  return new Set(Array.from(deletedMap.keys(), (key) => String(key)));
}

export function publishGalleryDelete(ydoc: Y.Doc, whiteboardId: string): void {
  ydoc.transact(() => {
    ydoc.getMap(YJS_GALLERY_DELETED_KEY).set(whiteboardId, Date.now());
    ydoc.getMap(YJS_GALLERY_CREATED_KEY).delete(whiteboardId);
    ydoc.getMap(YJS_GALLERY_VISIBILITY_KEY).delete(whiteboardId);
  }, LOCAL_ORIGIN);
}

export function publishGalleryCreate(ydoc: Y.Doc, board: WhiteboardSummary): void {
  ydoc.transact(() => {
    ydoc.getMap(YJS_GALLERY_CREATED_KEY).set(board.id, structuredClone(board));
  }, LOCAL_ORIGIN);
}

export function publishGalleryVisibility(ydoc: Y.Doc, board: WhiteboardSummary): void {
  ydoc.transact(() => {
    ydoc.getMap(YJS_GALLERY_VISIBILITY_KEY).set(board.id, structuredClone(board));
  }, LOCAL_ORIGIN);
}

export function observeGalleryDeletes(
  ydoc: Y.Doc,
  onDelete: (whiteboardId: string) => void,
): () => void {
  const deletedMap = ydoc.getMap(YJS_GALLERY_DELETED_KEY);

  const handler = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return;

    event.changes.keys.forEach((change, key) => {
      if (change.action === 'add' || change.action === 'update') {
        onDelete(String(key));
      }
    });
  };

  deletedMap.observe(handler);
  return () => deletedMap.unobserve(handler);
}

export function observeGalleryCreates(
  ydoc: Y.Doc,
  onCreate: (board: WhiteboardSummary) => void,
): () => void {
  const createdMap = ydoc.getMap(YJS_GALLERY_CREATED_KEY);

  const handler = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return;

    event.changes.keys.forEach((change, key) => {
      if (change.action !== 'add' && change.action !== 'update') return;
      const board = clonePlainValue<WhiteboardSummary>(createdMap.get(key));
      if (board && isWhiteboardSummary(board)) {
        onCreate(board);
      }
    });
  };

  createdMap.observe(handler);
  return () => createdMap.unobserve(handler);
}

export function observeGalleryVisibility(
  ydoc: Y.Doc,
  onVisibilityChange: (board: WhiteboardSummary) => void,
): () => void {
  const visibilityMap = ydoc.getMap(YJS_GALLERY_VISIBILITY_KEY);

  const handler = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return;

    event.changes.keys.forEach((change, key) => {
      if (change.action !== 'add' && change.action !== 'update') return;
      const board = clonePlainValue<WhiteboardSummary>(visibilityMap.get(key));
      if (board && isWhiteboardSummary(board)) {
        onVisibilityChange(board);
      }
    });
  };

  visibilityMap.observe(handler);
  return () => visibilityMap.unobserve(handler);
}
