import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { loadEnvFiles } from '../config/loadEnv.ts';
import {
  canCreateWhiteboard,
  type AuthSessionInfo,
  type UserRole,
} from '../shared/auth.ts';
import { isValidDeptCode } from './dept.ts';
import {
  findMemberByUsername,
  hashPassword,
  updateMemberPasswordHash,
  verifyPassword,
} from './membersService.ts';

loadEnvFiles();

export const AUTH_COOKIE_NAME = 'wb_auth';
export const AUTH_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export type SessionPayload = AuthSessionInfo & { exp: number };

export interface AuthenticatedUser {
  username: string;
  role: UserRole;
  adminDept?: string;
  displayName?: string;
}

function authSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    'whiteboard-dev-secret'
  );
}

function signPayload(payload: string): string {
  return createHmac('sha256', authSecret()).update(payload).digest('hex');
}

export function createSessionToken(session: AuthSessionInfo): string {
  const payload: SessionPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + AUTH_MAX_AGE_SEC,
  };
  const payloadStr = JSON.stringify(payload);
  const signature = signPayload(payloadStr);
  return Buffer.from(JSON.stringify({ payload: payloadStr, signature })).toString('base64url');
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as { payload: string; signature: string };

    const expected = signPayload(decoded.payload);
    if (
      decoded.signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(decoded.signature), Buffer.from(expected))
    ) {
      return null;
    }

    const session = JSON.parse(decoded.payload) as SessionPayload;
    if (Math.floor(Date.now() / 1000) > session.exp) return null;
    if (!isValidDeptCode(session.byDept)) return null;
    if (session.role === 'dept' || !session.role) session.role = 'user';
    return session;
  } catch {
    return null;
  }
}

function getSuperAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME?.trim() || 'admin',
    password: process.env.ADMIN_PASSWORD?.trim() || 'admin1234',
  };
}

function getUserPassword(): string {
  return process.env.USER_PASSWORD?.trim() || 'user!!';
}

export async function authenticateUser(
  username: string,
  password: string,
  _byDept: string,
): Promise<AuthenticatedUser | null> {
  const normalizedUsername = username.trim();
  const normalizedPassword = password;

  const member = await findMemberByUsername(normalizedUsername);
  if (member) {
    if (member.disabled) return null;
    if (!verifyPassword(normalizedPassword, member.passwordHash)) return null;

    // Upgrade legacy plain password storage
    if (member.passwordHash && !member.passwordHash.includes(':')) {
      void updateMemberPasswordHash(member.id, hashPassword(normalizedPassword));
    }

    const memberDisplayName = member.displayName?.trim() || undefined;

    return {
      username: member.username,
      role: member.role === 'super' ? 'super' : 'user',
      ...(memberDisplayName ? { displayName: memberDisplayName } : {}),
    };
  }

  const superAdmin = getSuperAdminCredentials();
  if (
    normalizedUsername === superAdmin.username &&
    normalizedPassword === superAdmin.password
  ) {
    return { username: normalizedUsername, role: 'super' };
  }

  if (normalizedPassword === getUserPassword() && normalizedUsername.length > 0) {
    return { username: normalizedUsername, role: 'user' };
  }

  return null;
}

export function sessionCanCreate(session: SessionPayload): boolean {
  return canCreateWhiteboard(session);
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

export function getSessionFromRequest(req: Request): SessionPayload | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  return verifySessionToken(cookies[AUTH_COOKIE_NAME]);
}

export function setAuthCookie(res: Response, token: string, req?: Request): void {
  const secure = req ? cookieSecure(req) : false;
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_MAX_AGE_SEC}${secure ? '; Secure' : ''}`,
  );
}

export function clearAuthCookie(res: Response, req?: Request): void {
  const secure = req ? cookieSecure(req) : false;
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
  );
}

export function cookieSecure(req: Request): boolean {
  if (process.env.COOKIE_SECURE === '0') return false;
  if (process.env.COOKIE_SECURE === '1') return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') return proto.split(',')[0].trim() === 'https';
  return false;
}
