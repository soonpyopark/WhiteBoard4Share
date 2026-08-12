export type UserRole = 'super' | 'dept' | 'user';
export type AuthSource = 'keycloak' | 'local';

export interface AuthSessionInfo {
  username: string;
  byDept: string;
  displayName: string;
  role: UserRole;
  adminDept?: string;
  source?: AuthSource;
}

export function canCreateWhiteboard(session: Pick<AuthSessionInfo, 'role' | 'byDept' | 'adminDept'>): boolean {
  return session.role === 'super';
}

export function canManageGallery(session: Pick<AuthSessionInfo, 'role' | 'byDept' | 'adminDept'>): boolean {
  return canCreateWhiteboard(session);
}

/** Create / delete folders — 총괄관리자만. */
export function canCreateOrDeleteFolders(session: Pick<AuthSessionInfo, 'role'>): boolean {
  return session.role === 'super';
}

/** Rename folder — 총괄관리자만. */
export function canRenameFolder(
  session: Pick<AuthSessionInfo, 'role' | 'adminDept'>,
  _folderId: string,
): boolean {
  return session.role === 'super';
}

export interface WhiteboardVisibility {
  isPrivate?: boolean;
  isViewRestricted?: boolean;
}

/** Gallery visibility (share-link access is handled separately). */
export function canViewWhiteboardInGallery(
  session: Pick<AuthSessionInfo, 'role' | 'byDept' | 'adminDept'>,
  board: WhiteboardVisibility,
  boardDept: string,
): boolean {
  if (session.role === 'super') return true;

  const isPrivate = board.isPrivate === true;
  const isViewRestricted = board.isViewRestricted === true;

  if (!isPrivate && !isViewRestricted) return true;

  if (isPrivate) return false;
  if (isViewRestricted) return session.byDept === boardDept;
  return true;
}
