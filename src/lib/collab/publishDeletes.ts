import type { DeleteSelectedResult } from '../../engine/drawingEngine';
import type { ImageObject, TableObject } from '../../engine/types';
import type { SceneWriteEvent } from './scene-events';

export interface ImageTableSnapshot {
  images: ImageObject[];
  tables: TableObject[];
}

export function buildImageUpsertEvent(image: ImageObject): SceneWriteEvent {
  return { type: 'image-upsert', image: structuredClone(image) };
}

export function buildTableUpsertEvent(table: TableObject): SceneWriteEvent {
  return { type: 'table-upsert', table: structuredClone(table) };
}

export function buildDeleteSelectedEvents(result: DeleteSelectedResult): SceneWriteEvent[] {
  return [
    ...result.paths.map((id) => ({ type: 'path-delete' as const, id })),
    ...result.images.map((id) => ({ type: 'image-delete' as const, id })),
    ...result.texts.map((id) => ({ type: 'text-delete' as const, id })),
    ...result.tables.map((id) => ({ type: 'table-delete' as const, id })),
  ];
}

export function buildImageTableDeleteEvents(result: DeleteSelectedResult): SceneWriteEvent[] {
  return [
    ...result.images.map((id) => ({ type: 'image-delete' as const, id })),
    ...result.tables.map((id) => ({ type: 'table-delete' as const, id })),
  ];
}

export function buildImageTableSnapshotDiffEvents(
  before: ImageTableSnapshot,
  after: ImageTableSnapshot,
): SceneWriteEvent[] {
  const beforeImageIds = new Set(before.images.map((image) => image.id));
  const afterImageIds = new Set(after.images.map((image) => image.id));
  const beforeTableIds = new Set(before.tables.map((table) => table.id));
  const afterTableIds = new Set(after.tables.map((table) => table.id));

  const events: SceneWriteEvent[] = [];

  for (const image of after.images) {
    if (!beforeImageIds.has(image.id)) {
      events.push(buildImageUpsertEvent(image));
    }
  }
  for (const id of beforeImageIds) {
    if (!afterImageIds.has(id)) {
      events.push({ type: 'image-delete', id });
    }
  }

  for (const table of after.tables) {
    if (!beforeTableIds.has(table.id)) {
      events.push(buildTableUpsertEvent(table));
    }
  }
  for (const id of beforeTableIds) {
    if (!afterTableIds.has(id)) {
      events.push({ type: 'table-delete', id });
    }
  }

  return events;
}

export function hasImageOrTableDeletes(result: DeleteSelectedResult): boolean {
  return result.images.length > 0 || result.tables.length > 0;
}
