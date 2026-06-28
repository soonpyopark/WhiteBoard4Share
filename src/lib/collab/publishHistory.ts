import { diffSceneSnapshots, isScenePatchEmpty, type SceneWriteEvent } from './scene-events.ts';
import { isSnapshotEmpty, type SceneSnapshot } from './schema.ts';

const BULK_HISTORY_SYNC_THRESHOLD = 4;

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

export function shouldShareSceneForHistoryDiff(
  before: SceneSnapshot,
  after: SceneSnapshot,
): boolean {
  if (isSnapshotEmpty(after) && !isSnapshotEmpty(before)) return true;
  if (!isSnapshotEmpty(after) && isSnapshotEmpty(before)) return true;

  const { upserts, deletes } = diffSceneSnapshots(before, after);
  return countSceneChanges(upserts, deletes) >= BULK_HISTORY_SYNC_THRESHOLD;
}

export function buildHistoryScenePatchEvent(
  before: SceneSnapshot,
  after: SceneSnapshot,
): SceneWriteEvent | null {
  const { upserts, deletes } = diffSceneSnapshots(before, after);
  if (isScenePatchEmpty(upserts, deletes)) return null;
  return { type: 'scene-patch', upserts, deletes };
}
