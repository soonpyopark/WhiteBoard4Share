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

/** Seeded when the data root has no tenant folders. First entry is the default selection. */
export const DEFAULT_FOLDER_IDS = ['업무폴더', '개인폴더'] as const;
export const DEFAULT_FOLDER_ID: string = DEFAULT_FOLDER_IDS[0];

export const MAX_FOLDER_NAME_LENGTH = 40;

/** Old 7-digit dept codes (0000001 / 0000002). Never create these again. */
const LEGACY_NUMERIC_FOLDER_RE = /^\d{7}$/;

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

export function isLegacyNumericFolderId(value: unknown): boolean {
  return typeof value === 'string' && LEGACY_NUMERIC_FOLDER_RE.test(value.trim());
}

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
  // Never allow creating/renaming to legacy 0000001-style ids.
  if (isLegacyNumericFolderId(trimmed)) return null;
  return trimmed;
}

/** Folder id === on-disk directory name (create/rename). */
export function normalizeFolderId(value: unknown): FolderId | null {
  return normalizeFolderName(value);
}

export function isValidFolderId(value: unknown): value is FolderId {
  return normalizeFolderId(value) != null;
}

/**
 * Accepts leftover legacy numeric dirs for read/list only.
 * New create/rename still goes through normalizeFolderName (rejects them).
 */
export function isReadableFolderId(value: unknown): value is FolderId {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isLegacyNumericFolderId(trimmed)) return true;
  return isValidFolderId(trimmed);
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
