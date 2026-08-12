import fs from 'fs/promises';
import path from 'path';
import {
  DEFAULT_FOLDER_ID,
  isLegacyNumericFolderId,
  isReadableFolderId,
  isValidFolderId,
} from '../shared/folders.ts';
import { getDataDir } from './paths.ts';

/** @deprecated Prefer isValidFolderId — kept as alias for call-site compatibility. */
export function isValidDeptCode(code: string): boolean {
  return isValidFolderId(code.trim());
}

export function getDeptDataDir(byDept: string): string {
  const normalized = byDept.trim();
  // Allow reading leftover legacy numeric dirs; never create new ones via seed/API.
  if (!isReadableFolderId(normalized)) {
    throw new Error('Invalid folder name');
  }
  return path.join(getDataDir(), normalized);
}

export async function listDepartments(): Promise<string[]> {
  const root = getDataDir();
  await fs.mkdir(root, { recursive: true });

  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  const departments: string[] = [];
  for (const entry of entries) {
    // Do not surface legacy 0000001 / 0000002 as active folders.
    if (!isValidFolderId(entry)) continue;
    try {
      const stat = await fs.stat(path.join(root, entry));
      if (stat.isDirectory()) {
        departments.push(entry);
      }
    } catch {
      /* skip */
    }
  }

  return departments.sort((a, b) => {
    if (a === DEFAULT_FOLDER_ID) return -1;
    if (b === DEFAULT_FOLDER_ID) return 1;
    return a.localeCompare(b, 'ko');
  });
}

/**
 * Ensure default tenants exist. Never creates 0000001 / 0000002.
 * Seeds 업무폴더 + 개인폴더 when the data root has no usable folders.
 */
export async function ensureDefaultDepartments(): Promise<void> {
  const root = getDataDir();
  await fs.mkdir(root, { recursive: true });

  const existing = await listDepartments();
  if (existing.length === 0) {
    const { seedDefaultFolders } = await import('./foldersService.ts');
    await seedDefaultFolders();
  }

  await migrateLegacyRootData(root);

  const { syncFolderMetadata } = await import('./foldersService.ts');
  await syncFolderMetadata();
}

async function migrateLegacyRootData(root: string): Promise<void> {
  const existing = await listDepartments();
  const targetName = existing.includes(DEFAULT_FOLDER_ID)
    ? DEFAULT_FOLDER_ID
    : existing[0] ?? DEFAULT_FOLDER_ID;

  if (isLegacyNumericFolderId(targetName) || !isValidFolderId(targetName)) return;

  const targetDir = path.join(root, targetName);
  await fs.mkdir(targetDir, { recursive: true });

  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    if (entry === 'share-links.json' || entry.startsWith('.wb4s-')) continue;
    const source = path.join(root, entry);
    const dest = path.join(targetDir, entry);
    try {
      const stat = await fs.stat(source);
      if (!stat.isFile()) continue;
      await fs.rename(source, dest);
    } catch {
      /* skip */
    }
  }
}
