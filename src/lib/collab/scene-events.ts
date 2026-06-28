import type { ImageObject, PathObject, TableObject, TextObject } from '../../engine/types.ts';
import type { SceneItemDeletes, SceneSnapshot } from './schema.ts';
import { computeDeletedSceneIds } from './schema.ts';

export type SceneWriteEvent =
  | { type: 'path-upsert'; path: PathObject }
  | { type: 'path-delete'; id: string }
  | { type: 'image-upsert'; image: ImageObject }
  | { type: 'image-delete'; id: string }
  | { type: 'text-upsert'; text: TextObject }
  | { type: 'text-delete'; id: string }
  | { type: 'table-upsert'; table: TableObject }
  | { type: 'table-delete'; id: string }
  | { type: 'scene-patch'; upserts: SceneSnapshot; deletes: SceneItemDeletes };

function filterChanged<T extends { id: string }>(prevItems: T[], nextItems: T[]): T[] {
  const prevMap = new Map(prevItems.map((item) => [item.id, item]));
  return nextItems.filter((item) => {
    const prev = prevMap.get(item.id);
    return !prev || JSON.stringify(prev) !== JSON.stringify(item);
  });
}

export function diffSceneSnapshots(
  before: SceneSnapshot,
  after: SceneSnapshot,
): { upserts: SceneSnapshot; deletes: SceneItemDeletes } {
  return {
    deletes: computeDeletedSceneIds(before, after),
    upserts: {
      paths: filterChanged(before.paths, after.paths),
      images: filterChanged(before.images, after.images),
      texts: filterChanged(before.texts, after.texts),
      tables: filterChanged(before.tables, after.tables),
    },
  };
}

export function isScenePatchEmpty(
  upserts: SceneSnapshot,
  deletes: SceneItemDeletes,
): boolean {
  return (
    upserts.paths.length === 0 &&
    upserts.images.length === 0 &&
    upserts.texts.length === 0 &&
    upserts.tables.length === 0 &&
    deletes.paths.length === 0 &&
    deletes.images.length === 0 &&
    deletes.texts.length === 0 &&
    deletes.tables.length === 0
  );
}
