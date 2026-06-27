import { apiRequest } from './client.ts';
import type { UserRole } from '../../shared/auth.ts';

export interface AuthSession {
  authenticated: boolean;
  username?: string;
  byDept?: string;
  displayName?: string;
  role?: UserRole;
  adminDept?: string;
  canCreateWhiteboard?: boolean;
}

export interface AuthSessionResponse extends AuthSession {
  ok?: boolean;
}

export function fetchDepartments(): Promise<{ departments: string[] }> {
  return apiRequest<{ departments: string[] }>('/departments');
}

export function fetchAuthSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/session');
}

export function login(params: {
  username: string;
  password: string;
  byDept: string;
  displayName: string;
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
