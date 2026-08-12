import type {
  WhiteboardFileDocument,
  WhiteboardFileExtension,
  WhiteboardFileImportPayload,
} from '../../../shared/whiteboard-file.ts';
import {
  WHITEBOARD_FILE_EXTENSION,
  WHITEBOARD_FILE_FORMAT,
  WHITEBOARD_FILE_VERSION,
  WHITEBOARD_JSON_EXTENSION,
} from '../../../shared/whiteboard-file.ts';
import type { ImageObject, PathObject, TableObject, TextObject } from '../../engine/types';
import { createId } from '../../utils/id';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitizeFilename(name: string, fallback: string): string {
  const trimmed = name.replace(INVALID_FILENAME_CHARS, '_').trim();
  return trimmed || fallback;
}

function cloneWithNewIds<T extends { id: string }>(items: T[] | undefined): T[] {
  if (!items?.length) return [];
  return items.map((item) => ({ ...item, id: createId() }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWhiteboardFileDocument(value: unknown): value is WhiteboardFileDocument {
  if (!isRecord(value)) return false;
  if (value.format !== WHITEBOARD_FILE_FORMAT) return false;
  if (value.version !== WHITEBOARD_FILE_VERSION) return false;
  if (typeof value.title !== 'string') return false;
  if (!Array.isArray(value.paths)) return false;
  if (value.images !== undefined && !Array.isArray(value.images)) return false;
  if (value.texts !== undefined && !Array.isArray(value.texts)) return false;
  if (value.tables !== undefined && !Array.isArray(value.tables)) return false;
  if (value.thumbnail !== undefined && typeof value.thumbnail !== 'string') return false;
  return true;
}

export function buildWhiteboardFileDocument(input: {
  title: string;
  paths: PathObject[];
  images?: ImageObject[];
  texts?: TextObject[];
  tables?: TableObject[];
  thumbnail?: string;
}): WhiteboardFileDocument {
  return {
    format: WHITEBOARD_FILE_FORMAT,
    version: WHITEBOARD_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    title: input.title.trim() || '제목 없음',
    paths: input.paths,
    images: input.images ?? [],
    texts: input.texts ?? [],
    tables: input.tables ?? [],
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
  };
}

export function downloadWhiteboardFile(input: {
  title: string;
  paths: PathObject[];
  images?: ImageObject[];
  texts?: TextObject[];
  tables?: TableObject[];
  thumbnail?: string;
  extension?: WhiteboardFileExtension;
}): void {
  const doc = buildWhiteboardFileDocument(input);
  const json = JSON.stringify(doc, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const base = sanitizeFilename(input.title.trim() || 'whiteboard', 'whiteboard');
  const extension =
    input.extension === WHITEBOARD_JSON_EXTENSION
      ? WHITEBOARD_JSON_EXTENSION
      : WHITEBOARD_FILE_EXTENSION;
  const link = document.createElement('a');
  link.href = url;
  link.download = `${base}${extension}`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseWhiteboardFileText(text: string): WhiteboardFileImportPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('화이트보드 파일 형식이 올바르지 않습니다.');
  }

  if (!isWhiteboardFileDocument(parsed)) {
    throw new Error('지원하지 않는 화이트보드 파일입니다.');
  }

  return {
    title: parsed.title.trim() || '제목 없음',
    paths: cloneWithNewIds(parsed.paths),
    images: cloneWithNewIds(parsed.images),
    texts: cloneWithNewIds(parsed.texts),
    tables: cloneWithNewIds(parsed.tables),
    thumbnail: parsed.thumbnail,
  };
}

export async function parseWhiteboardFile(file: File): Promise<WhiteboardFileImportPayload> {
  const text = await file.text();
  return parseWhiteboardFileText(text);
}
