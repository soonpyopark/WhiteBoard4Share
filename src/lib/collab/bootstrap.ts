import type { DrawingEngine } from '../../engine/drawingEngine.ts';
import type { CollabSession } from './doc-manager.ts';
import { getRemotePeerCount } from './doc-manager.ts';
import { diffSceneSnapshots } from './scene-events.ts';
import {
  isSceneEmpty,
  isSnapshotEmpty,
  mergeSceneToDoc,
  readSceneFromDoc,
  type SceneSnapshot,
} from './schema.ts';

const SYNC_FALLBACK_MS = 5000;
/** 이 이상 변경이면 경로별 redraw 대신 씬 전체를 한 번에 반영 */
const BULK_SYNC_THRESHOLD = 4;

function waitForWsSynced(session: CollabSession, timeoutMs: number): Promise<void> {
  if (session.wsProvider.synced) return Promise.resolve();

  return new Promise((resolve) => {
    const onSync = (synced: boolean) => {
      if (synced) {
        session.wsProvider.off('sync', onSync);
        resolve();
      }
    };

    session.wsProvider.on('sync', onSync);
    window.setTimeout(() => {
      session.wsProvider.off('sync', onSync);
      resolve();
    }, timeoutMs);
  });
}

export async function waitForCollabBootstrap(session: CollabSession): Promise<{
  hasRemotePeers: boolean;
}> {
  await waitForWsSynced(session, SYNC_FALLBACK_MS);
  return { hasRemotePeers: getRemotePeerCount(session) > 0 };
}

export function seedDocFromServerIfAlone(
  ydoc: CollabSession['ydoc'],
  serverScene: SceneSnapshot,
  hasRemotePeers: boolean,
): void {
  if (hasRemotePeers || !isSceneEmpty(ydoc)) return;
  mergeSceneToDoc(ydoc, serverScene);
}

export async function syncEngineFromYdoc(
  engine: DrawingEngine,
  ydoc: CollabSession['ydoc'],
): Promise<void> {
  const scene = readSceneFromDoc(ydoc);
  await engine.applyRemoteScene(scene.paths, scene.images, scene.texts, scene.tables);
}

function cloneSceneSnapshot(scene: SceneSnapshot): SceneSnapshot {
  return {
    paths: structuredClone(scene.paths),
    images: structuredClone(scene.images),
    texts: structuredClone(scene.texts),
    tables: structuredClone(scene.tables),
  };
}

/** 원격 ydoc 변경만 증분 반영 — 전체 씬 교체 없이 변경분만 적용 */
export async function applySceneDeltaToEngine(
  engine: DrawingEngine,
  previous: SceneSnapshot,
  next: SceneSnapshot,
): Promise<void> {
  const { upserts, deletes } = diffSceneSnapshots(previous, next);

  engine.beginRemoteUpdateBatch();
  try {
    for (const id of deletes.paths) engine.removeRemotePath(id);
    for (const id of deletes.images) engine.removeRemoteImage(id);
    for (const id of deletes.texts) engine.removeRemoteText(id);
    for (const id of deletes.tables) engine.removeRemoteTable(id);

    for (const path of upserts.paths) engine.upsertRemotePath(path);
    for (const image of upserts.images) await engine.upsertRemoteImage(image);
    for (const text of upserts.texts) engine.upsertRemoteText(text);
    for (const table of upserts.tables) engine.upsertRemoteTable(table);
  } finally {
    await engine.endRemoteUpdateBatch();
  }
}

function countSceneChanges(
  upserts: SceneSnapshot,
  deletes: ReturnType<typeof diffSceneSnapshots>['deletes'],
): number {
  return (
    upserts.paths.length +
    upserts.images.length +
    upserts.texts.length +
    upserts.tables.length +
    deletes.paths.length +
    deletes.images.length +
    deletes.texts.length +
    deletes.tables.length
  );
}

export async function syncEngineFromYdocDelta(
  engine: DrawingEngine,
  ydoc: CollabSession['ydoc'],
  previous: SceneSnapshot | null,
): Promise<SceneSnapshot> {
  const next = readSceneFromDoc(ydoc);
  if (!previous) {
    await engine.applyRemoteScene(next.paths, next.images, next.texts, next.tables);
    return cloneSceneSnapshot(next);
  }

  if (isSnapshotEmpty(next) && !isSnapshotEmpty(previous)) {
    await engine.applyRemoteScene([], [], [], []);
    return { paths: [], images: [], texts: [], tables: [] };
  }

  const { upserts, deletes } = diffSceneSnapshots(previous, next);
  if (countSceneChanges(upserts, deletes) >= BULK_SYNC_THRESHOLD) {
    await engine.applyRemoteScene(next.paths, next.images, next.texts, next.tables);
  } else {
    await applySceneDeltaToEngine(engine, previous, next);
  }
  return cloneSceneSnapshot(next);
}

function diffPendingLocalScene(ydocScene: SceneSnapshot, localScene: SceneSnapshot): SceneSnapshot {
  const ydocPathIds = new Set(ydocScene.paths.map((item) => item.id));
  const ydocImageIds = new Set(ydocScene.images.map((item) => item.id));
  const ydocTextIds = new Set(ydocScene.texts.map((item) => item.id));
  const ydocTableIds = new Set(ydocScene.tables.map((item) => item.id));

  return {
    paths: localScene.paths.filter((item) => !ydocPathIds.has(item.id)),
    images: localScene.images.filter((item) => !ydocImageIds.has(item.id)),
    texts: localScene.texts.filter((item) => !ydocTextIds.has(item.id)),
    tables: localScene.tables.filter((item) => !ydocTableIds.has(item.id)),
  };
}

export function mergePendingLocalSceneToDoc(
  ydoc: CollabSession['ydoc'],
  localScene: SceneSnapshot,
): void {
  const pending = diffPendingLocalScene(readSceneFromDoc(ydoc), localScene);
  if (
    pending.paths.length > 0 ||
    pending.images.length > 0 ||
    pending.texts.length > 0 ||
    pending.tables.length > 0
  ) {
    mergeSceneToDoc(ydoc, pending);
  }
}

export function captureEngineScene(engine: DrawingEngine): SceneSnapshot {
  return {
    paths: engine.getPathsSnapshot(),
    images: engine.getImagesSnapshot(),
    texts: engine.getTextsSnapshot(),
    tables: engine.getTablesSnapshot(),
  };
}
