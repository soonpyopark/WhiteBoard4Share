import fs from 'fs/promises';
import path from 'path';
import { isValidDeptCode } from './dept.ts';
import { getDataDir } from './paths.ts';

export interface ShareLinkRecord {
  byDept: string;
  whiteboardId: string;
}

type ShareLinkIndex = Record<string, ShareLinkRecord>;

function indexPath(): string {
  return path.join(getDataDir(), 'share-links.json');
}

function isShareLinkRecord(value: unknown): value is ShareLinkRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as ShareLinkRecord;
  return typeof record.byDept === 'string' && typeof record.whiteboardId === 'string';
}

async function writeIndex(index: ShareLinkIndex): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(indexPath(), JSON.stringify(index, null, 2), 'utf-8');
}

async function mergeLegacyDeptIndexes(index: ShareLinkIndex): Promise<ShareLinkIndex> {
  const dataDir = getDataDir();
  let changed = false;
  const next = { ...index };

  let entries: string[];
  try {
    entries = await fs.readdir(dataDir);
  } catch {
    return next;
  }

  for (const entry of entries) {
    if (!isValidDeptCode(entry)) continue;

    const legacyPath = path.join(dataDir, entry, 'share-links.json');
    try {
      const raw = await fs.readFile(legacyPath, 'utf-8');
      const legacy = JSON.parse(raw) as ShareLinkIndex;
      for (const [token, record] of Object.entries(legacy)) {
        if (!isShareLinkRecord(record) || next[token]) continue;
        next[token] = record;
        changed = true;
      }
      await fs.unlink(legacyPath);
    } catch {
      /* no legacy index in this dept */
    }
  }

  if (changed) {
    await writeIndex(next);
  }

  return next;
}

async function readIndex(): Promise<ShareLinkIndex> {
  let index: ShareLinkIndex = {};

  try {
    const raw = await fs.readFile(indexPath(), 'utf-8');
    const parsed = JSON.parse(raw) as ShareLinkIndex;
    index = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    index = {};
  }

  return mergeLegacyDeptIndexes(index);
}

async function lookupShareLinkFromDocuments(token: string): Promise<ShareLinkRecord | null> {
  const dataDir = getDataDir();
  let entries: string[];

  try {
    entries = await fs.readdir(dataDir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!isValidDeptCode(entry)) continue;

    const deptDir = path.join(dataDir, entry);
    let files: string[];
    try {
      files = await fs.readdir(deptDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.json') || file === 'gallery-order.json' || file === 'share-links.json') {
        continue;
      }

      try {
        const raw = await fs.readFile(path.join(deptDir, file), 'utf-8');
        const doc = JSON.parse(raw) as { id?: string; shareToken?: string };
        if (doc.shareToken === token && doc.id) {
          return { byDept: entry, whiteboardId: doc.id };
        }
      } catch {
        /* skip invalid whiteboard file */
      }
    }
  }

  return null;
}

export async function registerShareLink(
  token: string,
  record: ShareLinkRecord,
): Promise<void> {
  const index = await readIndex();
  index[token] = record;
  await writeIndex(index);
}

export async function unregisterShareLink(token: string): Promise<void> {
  const index = await readIndex();
  if (!(token in index)) return;
  delete index[token];
  await writeIndex(index);
}

export async function lookupShareLink(token: string): Promise<ShareLinkRecord | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const index = await readIndex();
  const indexed = index[trimmed];
  if (indexed?.byDept && indexed?.whiteboardId) {
    return indexed;
  }

  const fromDocument = await lookupShareLinkFromDocuments(trimmed);
  if (!fromDocument) return null;

  index[trimmed] = fromDocument;
  await writeIndex(index);
  return fromDocument;
}
