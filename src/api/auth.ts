import { apiRequest } from './client.ts';
import type { AuthSource, UserRole } from '../../shared/auth.ts';
import type { FolderInfo } from '../../shared/folders.ts';

export type { FolderInfo };

export interface AuthSession {
  authenticated: boolean;
  username?: string;
  byDept?: string;
  displayName?: string;
  role?: UserRole;
  adminDept?: string;
  source?: AuthSource;
  canCreateWhiteboard?: boolean;
  keycloakEnabled?: boolean;
  keycloakLoginUrl?: string | null;
  allowLocalLogin?: boolean;
  homeUrl?: string | null;
  homeTarget?: 'self' | 'blank';
}

export interface AuthSessionResponse extends AuthSession {
  ok?: boolean;
}

export function fetchDepartments(): Promise<{ departments: string[]; folders: FolderInfo[] }> {
  return apiRequest<{ departments: string[]; folders: FolderInfo[] }>('/departments');
}

export function fetchFolders(): Promise<{ folders: FolderInfo[] }> {
  return apiRequest<{ folders: FolderInfo[] }>('/folders');
}

export function createFolderApi(name: string): Promise<{ folder: FolderInfo; folders: FolderInfo[] }> {
  return apiRequest('/folders', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function renameFolderApi(
  id: string,
  name: string,
): Promise<{
  folder: FolderInfo;
  folders: FolderInfo[];
  requiresRestart: boolean;
  fromId: string;
  toId: string;
}> {
  return apiRequest(`/folders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteFolderApi(
  id: string,
  options?: { force?: boolean },
): Promise<{ id: string; folders: FolderInfo[] }> {
  const force = options?.force ? '?force=1' : '';
  return apiRequest(`/folders/${encodeURIComponent(id)}${force}`, {
    method: 'DELETE',
  });
}

export function reorderFoldersApi(ids: string[]): Promise<{ folders: FolderInfo[] }> {
  return apiRequest('/folders/order', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  });
}

export function fetchAuthSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/session');
}

export function login(params: {
  username: string;
  password: string;
  byDept: string;
  displayName?: string;
}): Promise<AuthSessionResponse> {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function switchDepartment(byDept: string): Promise<AuthSessionResponse> {
  return apiRequest('/auth/switch-dept', {
    method: 'POST',
    body: JSON.stringify({ byDept }),
  });
}

export function joinSession(params: {
  displayName: string;
  byDept: string;
}): Promise<AuthSessionResponse> {
  return apiRequest('/auth/join', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return apiRequest('/auth/logout', { method: 'POST' });
}
