import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_FOLDER_IDS,
  isValidFolderId,
  normalizeFolderId,
  normalizeFolderName,
  toFolderInfo,
  type FolderId,
  type FolderInfo,
} from '../shared/folders.ts';
import { getDeptDataDir, listDepartments } from './dept.ts';
import { remapMemberAdminDept } from './membersService.ts';
import { getDataDir } from './paths.ts';
import { remapShareLinkDept } from './share-links.ts';

const FOLDERS_META_FILE = '.wb4s-folders.json';

type FoldersMetaFile = {
  folders: FolderInfo[];
};

function metaPath(): string {
  return path.join(getDataDir(), FOLDERS_META_FILE);
}

async function readMetaFile(): Promise<FolderInfo[]> {
  try {
    const text = await fs.readFile(metaPath(), 'utf8');
    const parsed = JSON.parse(text) as FoldersMetaFile;
    if (!Array.isArray(parsed.folders)) return [];
    const result: FolderInfo[] = [];
    const seen = new Set<string>();
    for (const entry of parsed.folders) {
      if (!entry || typeof entry !== 'object') continue;
      // Prefer directory id; migrate away from display-name aliases.
      const rawId =
        typeof entry.id === 'string'
          ? entry.id.trim()
          : typeof entry.name === 'string'
            ? entry.name.trim()
            : '';
      const id = normalizeFolderId(rawId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(toFolderInfo(id));
    }
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeMetaFile(folders: FolderInfo[]): Promise<void> {
  const root = getDataDir();
  await fs.mkdir(root, { recursive: true });
  const payload: FoldersMetaFile = {
    folders: folders.map((folder) => toFolderInfo(folder.id)),
  };
  await fs.writeFile(metaPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function namesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function foldersEqual(a: FolderInfo[], b: FolderInfo[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((folder, index) => folder.id === b[index]?.id);
}

export async function syncFolderMetadata(): Promise<FolderInfo[]> {
  const idsOnDisk = await listDepartments();
  const diskSet = new Set(idsOnDisk);
  const existing = await readMetaFile();

  const next: FolderInfo[] = [];
  for (const folder of existing) {
    if (diskSet.has(folder.id)) next.push(toFolderInfo(folder.id));
  }
  for (const id of idsOnDisk) {
    if (next.some((folder) => folder.id === id)) continue;
    next.push(toFolderInfo(id));
  }

  if (!foldersEqual(next, existing)) await writeMetaFile(next);
  return next;
}

export async function listFolders(): Promise<FolderInfo[]> {
  return syncFolderMetadata();
}

/** Create 업무폴더 / 개인폴더 on a blank data root, 업무폴더 first. */
export async function seedDefaultFolders(): Promise<FolderInfo[]> {
  const folders = DEFAULT_FOLDER_IDS.map((id) => toFolderInfo(id));
  for (const folder of folders) {
    await fs.mkdir(getDeptDataDir(folder.id), { recursive: true });
  }
  await writeMetaFile(folders);
  return folders;
}

export async function getFolder(id: string): Promise<FolderInfo | null> {
  const normalized = normalizeFolderId(id);
  if (!normalized) return null;
  const folders = await listFolders();
  return folders.find((folder) => folder.id === normalized) ?? null;
}

export async function countWhiteboardsInFolder(folderId: string): Promise<number> {
  const dir = getDeptDataDir(folderId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }

  let count = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    if (entry === 'gallery-order.json' || entry === 'share-links.json') continue;
    if (entry.startsWith('.')) continue;
    count += 1;
  }
  return count;
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Rename on-disk tenant folder. Windows often cannot `rename` a dir that Electron still has open. */
async function moveDirectory(fromDir: string, toDir: string): Promise<void> {
  if (await directoryExists(toDir)) {
    throw Object.assign(new Error('같은 이름의 폴더가 이미 있습니다.'), { status: 409 });
  }

  try {
    await fs.rename(fromDir, toDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY' && code !== 'EXDEV') {
      throw Object.assign(
        new Error(
          error instanceof Error
            ? `폴더 이름을 바꾸지 못했습니다: ${error.message}`
            : '폴더 이름을 바꾸지 못했습니다.',
        ),
        { status: 500 },
      );
    }
    try {
      await fs.cp(fromDir, toDir, { recursive: true });
    } catch (copyError) {
      await fs.rm(toDir, { recursive: true, force: true }).catch(() => undefined);
      throw Object.assign(
        new Error(
          copyError instanceof Error
            ? `폴더 이름을 바꾸지 못했습니다: ${copyError.message}`
            : '폴더 이름을 바꾸지 못했습니다.',
        ),
        { status: 500 },
      );
    }
  }

  if (await directoryExists(fromDir)) {
    if (!(await directoryExists(toDir))) {
      throw Object.assign(new Error('폴더 이름을 바꾸지 못했습니다.'), { status: 500 });
    }
    await fs.rm(fromDir, { recursive: true, force: true });
  }
}

export async function createFolder(nameInput: unknown): Promise<FolderInfo> {
  const name = normalizeFolderName(nameInput);
  if (!name) {
    throw Object.assign(new Error('폴더 이름이 올바르지 않습니다.'), { status: 400 });
  }

  const folders = await listFolders();
  if (folders.some((folder) => namesEqual(folder.id, name))) {
    throw Object.assign(new Error('같은 이름의 폴더가 이미 있습니다.'), { status: 409 });
  }

  await fs.mkdir(getDeptDataDir(name), { recursive: true });
  const created = toFolderInfo(name);
  await writeMetaFile([...folders, created]);
  return created;
}

export type RenameFolderResult = {
  folder: FolderInfo;
  folders: FolderInfo[];
  requiresRestart: boolean;
  fromId: string;
  toId: string;
};

export async function renameFolder(
  folderId: string,
  nameInput: unknown,
): Promise<RenameFolderResult> {
  const fromId = normalizeFolderId(folderId);
  if (!fromId) {
    throw Object.assign(new Error('폴더를 찾을 수 없습니다.'), { status: 404 });
  }

  const toId = normalizeFolderName(nameInput);
  if (!toId) {
    throw Object.assign(new Error('폴더 이름이 올바르지 않습니다.'), { status: 400 });
  }

  const folders = await listFolders();
  const index = folders.findIndex((folder) => folder.id === fromId);
  if (index < 0) {
    throw Object.assign(new Error('폴더를 찾을 수 없습니다.'), { status: 404 });
  }

  if (fromId === toId) {
    return {
      folder: toFolderInfo(fromId),
      folders,
      requiresRestart: false,
      fromId,
      toId,
    };
  }

  if (folders.some((folder, i) => i !== index && namesEqual(folder.id, toId))) {
    throw Object.assign(new Error('같은 이름의 폴더가 이미 있습니다.'), { status: 409 });
  }

  const fromDir = getDeptDataDir(fromId);
  const toDir = path.join(getDataDir(), toId);
  await moveDirectory(fromDir, toDir);

  const next = folders.slice();
  next[index] = toFolderInfo(toId);
  await writeMetaFile(next);
  await remapShareLinkDept(fromId, toId);
  await remapMemberAdminDept(fromId, toId);

  return {
    folder: next[index]!,
    folders: next,
    requiresRestart: true,
    fromId,
    toId,
  };
}

export async function reorderFolders(idsInput: unknown): Promise<FolderInfo[]> {
  if (!Array.isArray(idsInput)) {
    throw Object.assign(new Error('폴더 순서 목록이 올바르지 않습니다.'), { status: 400 });
  }

  const requestedIds = idsInput
    .map((value) => normalizeFolderId(value))
    .filter((id): id is FolderId => Boolean(id));

  if (requestedIds.length !== idsInput.length) {
    throw Object.assign(new Error('폴더 ID가 올바르지 않습니다.'), { status: 400 });
  }
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw Object.assign(new Error('폴더 순서에 중복 ID가 있습니다.'), { status: 400 });
  }

  const folders = await listFolders();
  if (requestedIds.length !== folders.length) {
    throw Object.assign(new Error('폴더 목록이 일치하지 않습니다. 새로고침 후 다시 시도하세요.'), {
      status: 409,
    });
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const id of requestedIds) {
    if (!byId.has(id)) {
      throw Object.assign(new Error('알 수 없는 폴더가 포함되어 있습니다.'), { status: 400 });
    }
  }

  const next = requestedIds.map((id) => toFolderInfo(id));
  await writeMetaFile(next);
  return next;
}

export async function deleteFolder(
  folderId: string,
  options?: { force?: boolean },
): Promise<{ id: string }> {
  const id = normalizeFolderId(folderId);
  if (!id || !isValidFolderId(id)) {
    throw Object.assign(new Error('폴더를 찾을 수 없습니다.'), { status: 404 });
  }

  const folders = await listFolders();
  if (!folders.some((folder) => folder.id === id)) {
    throw Object.assign(new Error('폴더를 찾을 수 없습니다.'), { status: 404 });
  }

  if (folders.length <= 1) {
    throw Object.assign(new Error('마지막 폴더는 삭제할 수 없습니다.'), { status: 400 });
  }

  const boardCount = await countWhiteboardsInFolder(id);
  if (boardCount > 0 && !options?.force) {
    throw Object.assign(
      new Error(`폴더에 화이트보드 ${boardCount}개가 있어 삭제할 수 없습니다.`),
      { status: 409, boardCount },
    );
  }

  const dir = getDeptDataDir(id);
  await fs.rm(dir, { recursive: true, force: true });
  await writeMetaFile(folders.filter((folder) => folder.id !== id));
  return { id };
}
