import type * as Y from 'yjs';
import type { DrawingEngine } from '../../engine/drawingEngine.ts';
import { syncEngineFromYdocDelta } from './bootstrap.ts';
import {
  applySceneEventsToDoc,
  applySceneEventsToSnapshot,
  isSceneEmpty,
  LOCAL_ORIGIN,
  readSceneFromDoc,
  writeSceneToDoc,
  type SceneSnapshot,
} from './schema.ts';
import type { TableObject } from '../../engine/types.ts';
import type { SceneWriteEvent } from './scene-events.ts';
import { YJS_IMAGES_KEY, YJS_PATHS_KEY, YJS_TABLES_KEY, YJS_TEXTS_KEY } from './constants.ts';

const BULK_MAP_CHANGE_THRESHOLD = 4;

export interface YdocMirror {
  publishScene: (scene: SceneSnapshot) => void;
  publishTableUpsert: (table: TableObject) => void;
  publishSceneEvents: (events: SceneWriteEvent[]) => void;
  syncSharedToEngine: () => Promise<void>;
  initEmptyTracking: () => void;
  getPathCount: () => number;
  dispose: () => void;
}

function cloneSceneSnapshot(scene: SceneSnapshot): SceneSnapshot {
  return {
    paths: structuredClone(scene.paths),
    images: structuredClone(scene.images),
    texts: structuredClone(scene.texts),
    tables: structuredClone(scene.tables),
  };
}

/**
 * ydoc = 공유된 씬. 로컬 편집은 엔진에만 두고 publishScene()으로 공유.
 * 원격 공유 수신 시에만 엔진에 증분 반영.
 */
export function attachYdocMirror(ydoc: Y.Doc, engine: DrawingEngine): YdocMirror {
  const pathsMap = ydoc.getMap(YJS_PATHS_KEY);
  const imagesMap = ydoc.getMap(YJS_IMAGES_KEY);
  const textsMap = ydoc.getMap(YJS_TEXTS_KEY);
  const tablesMap = ydoc.getMap(YJS_TABLES_KEY);

  let lastScene: SceneSnapshot | null = null;
  let syncTimer: number | null = null;
  let syncing = false;
  let pendingSync = false;

  const runSync = async (): Promise<void> => {
    if (syncing) {
      pendingSync = true;
      return;
    }
    syncing = true;
    try {
      lastScene = await syncEngineFromYdocDelta(engine, ydoc, lastScene);
    } finally {
      syncing = false;
      if (pendingSync) {
        pendingSync = false;
        void runSync();
      }
    }
  };

  const scheduleSync = (immediate = false): void => {
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    if (immediate) {
      syncTimer = null;
      void runSync();
      return;
    }
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      void runSync();
    }, 16);
  };

  const onSceneChange = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction): void => {
    if (transaction.origin === LOCAL_ORIGIN) return;
    const changeCount = event.changes.keys.size + event.changes.deleted.size;
    const massDelete =
      event.changes.keys.size === 0 && event.changes.deleted.size >= BULK_MAP_CHANGE_THRESHOLD;
    scheduleSync(massDelete || changeCount >= BULK_MAP_CHANGE_THRESHOLD);
  };

  pathsMap.observe(onSceneChange);
  imagesMap.observe(onSceneChange);
  textsMap.observe(onSceneChange);
  tablesMap.observe(onSceneChange);

  return {
    publishScene: (scene) => {
      writeSceneToDoc(ydoc, scene);
      lastScene = cloneSceneSnapshot(scene);
    },
    publishTableUpsert: (table) => {
      const event = { type: 'table-upsert' as const, table: structuredClone(table) };
      applySceneEventsToDoc(ydoc, event);
      lastScene = lastScene
        ? applySceneEventsToSnapshot(lastScene, event)
        : cloneSceneSnapshot(readSceneFromDoc(ydoc));
    },
    publishSceneEvents: (events) => {
      if (events.length === 0) return;
      applySceneEventsToDoc(ydoc, events);
      lastScene = lastScene
        ? applySceneEventsToSnapshot(lastScene, events)
        : cloneSceneSnapshot(readSceneFromDoc(ydoc));
    },
    syncSharedToEngine: async () => {
      if (isSceneEmpty(ydoc)) {
        lastScene = { paths: [], images: [], texts: [], tables: [] };
        return;
      }
      await runSync();
    },
    initEmptyTracking: () => {
      lastScene = isSceneEmpty(ydoc)
        ? { paths: [], images: [], texts: [], tables: [] }
        : cloneSceneSnapshot(readSceneFromDoc(ydoc));
    },
    getPathCount: () => pathsMap.size,
    dispose: () => {
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer);
        syncTimer = null;
      }
      pathsMap.unobserve(onSceneChange);
      imagesMap.unobserve(onSceneChange);
      textsMap.unobserve(onSceneChange);
      tablesMap.unobserve(onSceneChange);
      lastScene = null;
    },
  };
}
