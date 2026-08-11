/**
 * Folder tenants live as directories under the data root.
 * The directory name IS the folder id/name (no separate display alias).
 */

export type FolderId = string;

export type FolderInfo = {
  /** Same as on-disk directory name. */
  id: FolderId;
  /** Always equal to `id` (kept for API compatibility). */
  name: string;
};

export const MAX_FOLDER_NAME_LENGTH = 40;

const INVALID_NAME_CHARS = /[/\\:*?"<>|]/;
const RESERVED_FOLDER_NAMES = new Set([
  'embed',
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

export function isReservedFolderName(value: string): boolean {
  const key = value.trim().toLowerCase();
  if (!key) return true;
  if (key.startsWith('.')) return true;
  return RESERVED_FOLDER_NAMES.has(key);
}

export function normalizeFolderName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (trimmed.length > MAX_FOLDER_NAME_LENGTH) return null;
  if (trimmed === '.' || trimmed === '..') return null;
  if (INVALID_NAME_CHARS.test(trimmed)) return null;
  if (/[. ]$/.test(trimmed)) return null;
  if (isReservedFolderName(trimmed)) return null;
  return trimmed;
}

/** Folder id === on-disk directory name. */
export function normalizeFolderId(value: unknown): FolderId | null {
  return normalizeFolderName(value);
}

export function isValidFolderId(value: unknown): value is FolderId {
  return normalizeFolderId(value) != null;
}

export function defaultFolderName(id: FolderId): string {
  return id;
}

export function folderDisplayLabel(folder: Pick<FolderInfo, 'id' | 'name'>): string {
  return folder.name?.trim() || folder.id;
}

export function toFolderInfo(id: FolderId): FolderInfo {
  return { id, name: id };
}
