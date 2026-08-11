import fs from 'fs/promises';
import path from 'path';
import { isValidFolderId } from '../shared/folders.ts';
import { getDataDir } from './paths.ts';

const DEPT_PATTERN_LEGACY = /^\d{7}$/;

/** @deprecated Prefer isValidFolderId — kept as alias for call-site compatibility. */
export function isValidDeptCode(code: string): boolean {
  return isValidFolderId(code.trim());
}

export function getDeptDataDir(byDept: string): string {
  const normalized = byDept.trim();
  if (!isValidFolderId(normalized)) {
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

  // Prefer meta order elsewhere; here return a stable fallback (legacy numeric first).
  return departments.sort((a, b) => {
    const aLegacy = DEPT_PATTERN_LEGACY.test(a);
    const bLegacy = DEPT_PATTERN_LEGACY.test(b);
    if (aLegacy && bLegacy) return a.localeCompare(b);
    if (aLegacy) return -1;
    if (bLegacy) return 1;
    return a.localeCompare(b, 'ko');
  });
}

export async function ensureDefaultDepartments(): Promise<void> {
  const root = getDataDir();
  await fs.mkdir(root, { recursive: true });

  for (const code of ['0000001', '0000002']) {
    await fs.mkdir(path.join(root, code), { recursive: true });
  }

  await migrateLegacyRootData(root);

  const { syncFolderMetadata } = await import('./foldersService.ts');
  await syncFolderMetadata();
}

async function migrateLegacyRootData(root: string): Promise<void> {
  const targetDir = path.join(root, '0000001');
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
