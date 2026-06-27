import fs from 'fs/promises';
import path from 'path';
import { getDataDir } from './paths.ts';

const DEPT_PATTERN = /^\d{7}$/;

export function isValidDeptCode(code: string): boolean {
  return DEPT_PATTERN.test(code.trim());
}

export function getDeptDataDir(byDept: string): string {
  const normalized = byDept.trim();
  if (!isValidDeptCode(normalized)) {
    throw new Error('Invalid department code');
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
    if (!isValidDeptCode(entry)) continue;
    try {
      const stat = await fs.stat(path.join(root, entry));
      if (stat.isDirectory()) {
        departments.push(entry);
      }
    } catch {
      /* skip */
    }
  }

  return departments.sort();
}

export async function ensureDefaultDepartments(): Promise<void> {
  const root = getDataDir();
  await fs.mkdir(root, { recursive: true });

  for (const code of ['0000001', '0000002']) {
    await fs.mkdir(path.join(root, code), { recursive: true });
  }

  await migrateLegacyRootData(root);
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
