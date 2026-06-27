import * as Y from 'yjs';
import type { ImageObject, PathObject, TextObject } from '../../engine/types.ts';
import type { SceneWriteEvent } from './scene-events.ts';
import { YJS_IMAGES_KEY, YJS_PATHS_KEY, YJS_TEXTS_KEY } from './constants.ts';
import { clonePlainValue } from './yvalue.ts';

export interface SceneSnapshot {
  paths: PathObject[];
  images: ImageObject[];
  texts: TextObject[];
}

export const LOCAL_ORIGIN = 'local';

function getPathsMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(YJS_PATHS_KEY);
}

function getImagesMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(YJS_IMAGES_KEY);
}

function getTextsMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(YJS_TEXTS_KEY);
}

function readMapValues<T>(ymap: Y.Map<unknown>): T[] {
  const items: T[] = [];
  ymap.forEach((value) => {
    const cloned = clonePlainValue<T>(value);
    if (cloned) items.push(cloned);
  });
  return items;
}

export function readSceneFromDoc(ydoc: Y.Doc): SceneSnapshot {
  return {
    paths: readMapValues<PathObject>(getPathsMap(ydoc)),
    images: readMapValues<ImageObject>(getImagesMap(ydoc)),
    texts: readMapValues<TextObject>(getTextsMap(ydoc)),
  };
}

export function isSceneEmpty(ydoc: Y.Doc): boolean {
  const scene = readSceneFromDoc(ydoc);
  return scene.paths.length === 0 && scene.images.length === 0 && scene.texts.length === 0;
}

export interface SceneItemDeletes {
  paths: string[];
  images: string[];
  texts: string[];
}

export function computeDeletedSceneIds(
  previous: SceneSnapshot | null,
  next: SceneSnapshot,
): SceneItemDeletes {
  if (!previous) {
    return { paths: [], images: [], texts: [] };
  }

  const nextPathIds = new Set(next.paths.map((item) => item.id));
  const nextImageIds = new Set(next.images.map((item) => item.id));
  const nextTextIds = new Set(next.texts.map((item) => item.id));

  return {
    paths: previous.paths.filter((item) => !nextPathIds.has(item.id)).map((item) => item.id),
    images: previous.images.filter((item) => !nextImageIds.has(item.id)).map((item) => item.id),
    texts: previous.texts.filter((item) => !nextTextIds.has(item.id)).map((item) => item.id),
  };
}

export function mergeSceneToDoc(ydoc: Y.Doc, scene: SceneSnapshot): void {
  ydoc.transact(() => {
    const pathsMap = getPathsMap(ydoc);
    const imagesMap = getImagesMap(ydoc);
    const textsMap = getTextsMap(ydoc);

    for (const item of scene.paths) pathsMap.set(item.id, item);
    for (const item of scene.images) imagesMap.set(item.id, item);
    for (const item of scene.texts) textsMap.set(item.id, item);
  }, LOCAL_ORIGIN);
}

export function writeSceneToDoc(ydoc: Y.Doc, scene: SceneSnapshot): void {
  ydoc.transact(() => {
    const pathsMap = getPathsMap(ydoc);
    const imagesMap = getImagesMap(ydoc);
    const textsMap = getTextsMap(ydoc);

    const nextPathIds = new Set(scene.paths.map((item) => item.id));
    const nextImageIds = new Set(scene.images.map((item) => item.id));
    const nextTextIds = new Set(scene.texts.map((item) => item.id));

    for (const key of Array.from(pathsMap.keys())) {
      if (!nextPathIds.has(key)) pathsMap.delete(key);
    }
    for (const key of Array.from(imagesMap.keys())) {
      if (!nextImageIds.has(key)) imagesMap.delete(key);
    }
    for (const key of Array.from(textsMap.keys())) {
      if (!nextTextIds.has(key)) textsMap.delete(key);
    }

    for (const item of scene.paths) pathsMap.set(item.id, item);
    for (const item of scene.images) imagesMap.set(item.id, item);
    for (const item of scene.texts) textsMap.set(item.id, item);
  }, LOCAL_ORIGIN);
}

export function clearSceneInDoc(ydoc: Y.Doc): void {
  writeSceneToDoc(ydoc, { paths: [], images: [], texts: [] });
}

export function applySceneEventsToDoc(
  ydoc: Y.Doc,
  input: SceneWriteEvent | SceneWriteEvent[],
): void {
  const events = Array.isArray(input) ? input : [input];
  if (events.length === 0) return;

  ydoc.transact(() => {
    const pathsMap = getPathsMap(ydoc);
    const imagesMap = getImagesMap(ydoc);
    const textsMap = getTextsMap(ydoc);

    for (const event of events) {
      switch (event.type) {
        case 'path-upsert':
          pathsMap.set(event.path.id, event.path);
          break;
        case 'path-delete':
          pathsMap.delete(event.id);
          break;
        case 'image-upsert':
          imagesMap.set(event.image.id, event.image);
          break;
        case 'image-delete':
          imagesMap.delete(event.id);
          break;
        case 'text-upsert':
          textsMap.set(event.text.id, event.text);
          break;
        case 'text-delete':
          textsMap.delete(event.id);
          break;
        case 'scene-patch': {
          for (const id of event.deletes.paths) pathsMap.delete(id);
          for (const id of event.deletes.images) imagesMap.delete(id);
          for (const id of event.deletes.texts) textsMap.delete(id);
          for (const path of event.upserts.paths) pathsMap.set(path.id, path);
          for (const image of event.upserts.images) imagesMap.set(image.id, image);
          for (const text of event.upserts.texts) textsMap.set(text.id, text);
          break;
        }
      }
    }
  }, LOCAL_ORIGIN);
}

/** ydoc mirror 추적용 — 전체 read 없이 이벤트만 반영 */
export function applySceneEventsToSnapshot(
  scene: SceneSnapshot,
  input: SceneWriteEvent | SceneWriteEvent[],
): SceneSnapshot {
  const events = Array.isArray(input) ? input : [input];
  if (events.length === 0) return scene;

  const paths = new Map(scene.paths.map((item) => [item.id, item]));
  const images = new Map(scene.images.map((item) => [item.id, item]));
  const texts = new Map(scene.texts.map((item) => [item.id, item]));

  for (const event of events) {
    switch (event.type) {
      case 'path-upsert':
        paths.set(event.path.id, event.path);
        break;
      case 'path-delete':
        paths.delete(event.id);
        break;
      case 'image-upsert':
        images.set(event.image.id, event.image);
        break;
      case 'image-delete':
        images.delete(event.id);
        break;
      case 'text-upsert':
        texts.set(event.text.id, event.text);
        break;
      case 'text-delete':
        texts.delete(event.id);
        break;
      case 'scene-patch':
        for (const id of event.deletes.paths) paths.delete(id);
        for (const id of event.deletes.images) images.delete(id);
        for (const id of event.deletes.texts) texts.delete(id);
        for (const path of event.upserts.paths) paths.set(path.id, path);
        for (const image of event.upserts.images) images.set(image.id, image);
        for (const text of event.upserts.texts) texts.set(text.id, text);
        break;
    }
  }

  return {
    paths: Array.from(paths.values()),
    images: Array.from(images.values()),
    texts: Array.from(texts.values()),
  };
}
