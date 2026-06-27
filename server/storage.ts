import fs from 'fs/promises';
import path from 'path';
import type { SaveWhiteboardPayload, WhiteboardDocument, WhiteboardSummary } from '../shared/whiteboard.ts';
import { canViewWhiteboardInGallery, type AuthSessionInfo } from '../shared/auth.ts';
import { getDeptDataDir } from './dept.ts';
import { lookupShareLink, registerShareLink, unregisterShareLink } from './share-links.ts';

function filePath(byDept: string, id: string): string {
  return path.join(getDeptDataDir(byDept), `${id}.json`);
}

function galleryOrderPath(byDept: string): string {
  return path.join(getDeptDataDir(byDept), 'gallery-order.json');
}

async function readGalleryOrder(byDept: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(galleryOrderPath(byDept), 'utf-8');
    const parsed = JSON.parse(raw) as { order?: unknown };
    if (!Array.isArray(parsed.order)) return [];
    return parsed.order.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

async function saveGalleryOrder(byDept: string, order: string[]): Promise<void> {
  await ensureDataDir(byDept);
  await fs.writeFile(galleryOrderPath(byDept), JSON.stringify({ order }, null, 2), 'utf-8');
}

function applyGalleryOrder(
  summaries: WhiteboardSummary[],
  order: string[],
): WhiteboardSummary[] {
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));
  const result: WhiteboardSummary[] = [];
  const seen = new Set<string>();

  for (const id of order) {
    const summary = byId.get(id);
    if (!summary) continue;
    result.push(summary);
    seen.add(id);
  }

  const rest = summaries
    .filter((summary) => !seen.has(summary.id))
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  return [...result, ...rest];
}

async function insertIntoGalleryOrder(
  byDept: string,
  id: string,
  afterId?: string,
): Promise<void> {
  const order = await readGalleryOrder(byDept);
  const next = order.filter((entry) => entry !== id);

  if (afterId) {
    const index = next.indexOf(afterId);
    if (index >= 0) {
      next.splice(index + 1, 0, id);
    } else {
      next.unshift(id);
    }
  } else {
    next.unshift(id);
  }

  await saveGalleryOrder(byDept, next);
}

async function removeFromGalleryOrder(byDept: string, id: string): Promise<void> {
  const order = await readGalleryOrder(byDept);
  const next = order.filter((entry) => entry !== id);
  if (next.length !== order.length) {
    await saveGalleryOrder(byDept, next);
  }
}

export async function ensureDataDir(byDept: string): Promise<void> {
  await fs.mkdir(getDeptDataDir(byDept), { recursive: true });
}

async function readSummariesFromDept(byDept: string): Promise<WhiteboardSummary[]> {
  await ensureDataDir(byDept);
  const deptDir = getDeptDataDir(byDept);
  const files = await fs.readdir(deptDir);
  const summaries: WhiteboardSummary[] = [];

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'gallery-order.json' || file === 'share-links.json') {
      continue;
    }
    try {
      const raw = await fs.readFile(path.join(deptDir, file), 'utf-8');
      const doc = JSON.parse(raw) as WhiteboardDocument;
      if (!doc.id || !doc.updatedAt || typeof doc.title !== 'string') continue;
      summaries.push({
        id: doc.id,
        title: doc.title,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        thumbnail: doc.thumbnail,
        shareToken: doc.shareToken,
        isPrivate: doc.isPrivate,
        isViewRestricted: doc.isViewRestricted,
      });
    } catch {
      /* skip invalid files */
    }
  }

  return summaries;
}

export async function listWhiteboards(
  byDept: string,
  session?: Pick<AuthSessionInfo, 'role' | 'byDept' | 'adminDept'>,
): Promise<WhiteboardSummary[]> {
  const summaries = await readSummariesFromDept(byDept);
  const ordered = applyGalleryOrder(summaries, await readGalleryOrder(byDept));
  if (!session) return ordered;
  return ordered.filter((board) => canViewWhiteboardInGallery(session, board, byDept));
}

export async function getWhiteboard(
  byDept: string,
  id: string,
): Promise<WhiteboardDocument | null> {
  try {
    const raw = await fs.readFile(filePath(byDept, id), 'utf-8');
    return JSON.parse(raw) as WhiteboardDocument;
  } catch {
    return null;
  }
}

export async function createWhiteboard(byDept: string): Promise<WhiteboardDocument> {
  await ensureDataDir(byDept);
  const now = new Date().toISOString();
  const doc: WhiteboardDocument = {
    id: crypto.randomUUID(),
    title: '제목 없음',
    createdAt: now,
    updatedAt: now,
    paths: [],
  };
  await fs.writeFile(filePath(byDept, doc.id), JSON.stringify(doc, null, 2), 'utf-8');
  await insertIntoGalleryOrder(byDept, doc.id);
  return doc;
}

export async function saveWhiteboard(
  byDept: string,
  id: string,
  payload: SaveWhiteboardPayload,
): Promise<WhiteboardDocument | null> {
  const existing = await getWhiteboard(byDept, id);
  if (!existing) return null;

  const doc: WhiteboardDocument = {
    ...existing,
    title: payload.title ?? existing.title,
    paths: payload.paths,
    images: payload.images ?? existing.images ?? [],
    texts: payload.texts ?? existing.texts ?? [],
    thumbnail: payload.thumbnail ?? existing.thumbnail,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath(byDept, id), JSON.stringify(doc), 'utf-8');
  return doc;
}

export async function deleteWhiteboard(byDept: string, id: string): Promise<boolean> {
  try {
    const existing = await getWhiteboard(byDept, id);
    if (existing?.shareToken) {
      await unregisterShareLink(existing.shareToken);
    }
    await fs.unlink(filePath(byDept, id));
    await removeFromGalleryOrder(byDept, id);
    return true;
  } catch {
    return false;
  }
}

export async function renameWhiteboard(
  byDept: string,
  id: string,
  title: string,
): Promise<WhiteboardDocument | null> {
  const existing = await getWhiteboard(byDept, id);
  if (!existing) return null;

  const doc: WhiteboardDocument = {
    ...existing,
    title: title.trim() || '제목 없음',
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath(byDept, id), JSON.stringify(doc), 'utf-8');
  return doc;
}

export async function updateWhiteboardVisibility(
  byDept: string,
  id: string,
  visibility: { isPrivate: boolean; isViewRestricted: boolean },
): Promise<WhiteboardDocument | null> {
  const existing = await getWhiteboard(byDept, id);
  if (!existing) return null;

  const isPrivate = visibility.isPrivate === true;
  const isViewRestricted = isPrivate && visibility.isViewRestricted === true;

  const doc: WhiteboardDocument = {
    ...existing,
    isPrivate: isPrivate || undefined,
    isViewRestricted: isViewRestricted || undefined,
    updatedAt: new Date().toISOString(),
  };

  if (!isPrivate) {
    delete doc.isPrivate;
    delete doc.isViewRestricted;
  } else if (!isViewRestricted) {
    delete doc.isViewRestricted;
  }

  await fs.writeFile(filePath(byDept, id), JSON.stringify(doc), 'utf-8');
  return doc;
}

export function hasShareTokenAccess(
  doc: WhiteboardDocument | null,
  shareToken: string | null | undefined,
): boolean {
  if (!doc?.shareToken || !shareToken?.trim()) return false;
  return doc.shareToken === shareToken.trim();
}

function parseBaseTitle(title: string): string {
  const trimmed = title.trim() || '제목 없음';
  const numbered = trimmed.match(/ \((\d+)\)$/);
  if (numbered) {
    return trimmed.slice(0, -numbered[0].length);
  }
  if (trimmed.endsWith(' (복사)')) {
    return trimmed.slice(0, -' (복사)'.length);
  }
  return trimmed;
}

function nextCopyTitle(baseTitle: string, existingTitles: string[]): string {
  const escaped = baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped} \\((\\d+)\\)$`);

  let maxNum = 0;
  for (const title of existingTitles) {
    const match = title.trim().match(pattern);
    if (match) {
      maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
    }
  }

  return `${baseTitle} (${maxNum + 1})`;
}

function cloneWithNewIds<T extends { id: string }>(items: T[] | undefined): T[] {
  if (!items?.length) return [];
  return items.map((item) => ({ ...item, id: crypto.randomUUID() }));
}

export async function copyWhiteboard(
  byDept: string,
  id: string,
): Promise<WhiteboardDocument | null> {
  const existing = await getWhiteboard(byDept, id);
  if (!existing) return null;

  const boards = await listWhiteboards(byDept);
  const baseTitle = parseBaseTitle(existing.title);
  const title = nextCopyTitle(
    baseTitle,
    boards.map((board) => board.title),
  );

  await ensureDataDir(byDept);
  const now = new Date().toISOString();
  const doc: WhiteboardDocument = {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    paths: cloneWithNewIds(existing.paths),
    images: cloneWithNewIds(existing.images),
    texts: cloneWithNewIds(existing.texts),
    thumbnail: existing.thumbnail,
  };

  await fs.writeFile(filePath(byDept, doc.id), JSON.stringify(doc, null, 2), 'utf-8');
  await insertIntoGalleryOrder(byDept, doc.id, id);
  return doc;
}

export async function reorderWhiteboards(
  byDept: string,
  ids: string[],
  session?: Pick<AuthSessionInfo, 'role' | 'byDept' | 'adminDept'>,
): Promise<WhiteboardSummary[]> {
  const summaries = await readSummariesFromDept(byDept);
  const validIds = new Set(summaries.map((summary) => summary.id));
  const seen = new Set<string>();
  const nextOrder: string[] = [];

  for (const boardId of ids) {
    if (!validIds.has(boardId) || seen.has(boardId)) continue;
    nextOrder.push(boardId);
    seen.add(boardId);
  }

  for (const summary of summaries) {
    if (!seen.has(summary.id)) {
      nextOrder.push(summary.id);
    }
  }

  await saveGalleryOrder(byDept, nextOrder);
  const ordered = applyGalleryOrder(summaries, nextOrder);
  if (!session) return ordered;
  return ordered.filter((board) => canViewWhiteboardInGallery(session, board, byDept));
}

export async function createShareLink(
  byDept: string,
  id: string,
): Promise<{ shareToken: string } | null> {
  const existing = await getWhiteboard(byDept, id);
  if (!existing) return null;

  if (existing.shareToken) {
    return { shareToken: existing.shareToken };
  }

  const shareToken = crypto.randomUUID();
  const doc: WhiteboardDocument = {
    ...existing,
    shareToken,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath(byDept, id), JSON.stringify(doc), 'utf-8');
  await registerShareLink(shareToken, { byDept, whiteboardId: id });
  return { shareToken };
}

export async function revokeShareLink(byDept: string, id: string): Promise<boolean> {
  const existing = await getWhiteboard(byDept, id);
  if (!existing?.shareToken) return false;

  const { shareToken } = existing;
  const doc: WhiteboardDocument = {
    ...existing,
    shareToken: undefined,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath(byDept, id), JSON.stringify(doc), 'utf-8');
  await unregisterShareLink(shareToken);
  return true;
}

export async function resolveShareLink(
  token: string,
): Promise<{ byDept: string; whiteboardId: string; title: string } | null> {
  const record = await lookupShareLink(token);
  if (!record) return null;

  const doc = await getWhiteboard(record.byDept, record.whiteboardId);
  if (!doc?.shareToken || doc.shareToken !== token.trim()) {
    await unregisterShareLink(token.trim());
    return null;
  }

  return {
    byDept: record.byDept,
    whiteboardId: record.whiteboardId,
    title: doc.title,
  };
}
