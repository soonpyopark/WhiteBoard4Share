export type UserRole = 'super' | 'dept' | 'user';

export interface AuthSessionInfo {
  username: string;
  byDept: string;
  displayName: string;
  role: UserRole;
  adminDept?: string;
}

export function canCreateWhiteboard(session: Pick<AuthSessionInfo, 'role' | 'byDept' | 'adminDept'>): boolean {
  if (session.role === 'super') return true;
  if (session.role === 'dept') {
    return session.adminDept === session.byDept;
  }
  return false;
}

export function canManageGallery(session: Pick<AuthSessionInfo, 'role' | 'byDept' | 'adminDept'>): boolean {
  return canCreateWhiteboard(session);
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

  if (session.role === 'user') {
    if (isPrivate) return false;
    if (isViewRestricted) return session.byDept === boardDept;
    return true;
  }

  if (session.role === 'dept') {
    if (isViewRestricted) return session.byDept === boardDept;
    if (isPrivate) return true;
    return true;
  }

  return false;
}
