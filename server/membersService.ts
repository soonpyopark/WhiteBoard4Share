import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  normalizeMemberRole,
  toPublicMember,
  type MemberRecord,
  type PublicMember,
} from '../shared/members.ts';
import type { UserRole } from '../shared/auth.ts';
import { getDataDir } from './paths.ts';

/** Persisted under data/; plan name kept for compatibility. */
const MEMBERS_FILE = '.wb4s-members.json';

type MembersFile = {
  version: 1;
  members: MemberRecord[];
};

/** Process-local cache — auth must work even if the OS briefly hides the file. */
let membersCache: MembersFile | null = null;

function membersPath(): string {
  return path.join(getDataDir(), MEMBERS_FILE);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;

  // Legacy / bootstrap plain storage → accept once
  if (!stored.includes(':')) {
    return stored === password;
  }

  const sep = stored.indexOf(':');
  const salt = stored.slice(0, sep);
  const hash = stored.slice(sep + 1);
  if (!salt || !hash) return false;
  try {
    const computed = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === computed.length && timingSafeEqual(expected, computed);
  } catch {
    return false;
  }
}

function normalizeMember(raw: unknown): MemberRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : '';
  const username =
    typeof record.username === 'string' && record.username.trim()
      ? record.username.trim()
      : '';
  const role = normalizeMemberRole(record.role);
  if (!id || !username || !role) return null;

  const passwordHash =
    typeof record.passwordHash === 'string'
      ? record.passwordHash
      : typeof record.password === 'string'
        ? hashPassword(record.password)
        : '';

  const displayName =
    typeof record.displayName === 'string' && record.displayName.trim()
      ? record.displayName.trim()
      : undefined;

  return {
    id,
    username,
    passwordHash,
    role,
    ...(displayName ? { displayName } : {}),
    disabled: Boolean(record.disabled),
  };
}

async function readFromDisk(): Promise<MembersFile | null> {
  try {
    const text = await fs.readFile(membersPath(), 'utf8');
    const parsed = JSON.parse(text) as { members?: unknown };
    const members = Array.isArray(parsed.members)
      ? parsed.members.map(normalizeMember).filter((m): m is MemberRecord => m != null)
      : [];
    return { version: 1, members };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readFile(): Promise<MembersFile> {
  if (membersCache) {
    return {
      version: 1,
      members: membersCache.members.map((m) => ({ ...m })),
    };
  }

  const fromDisk = await readFromDisk();
  if (fromDisk) {
    membersCache = fromDisk;
    return {
      version: 1,
      members: fromDisk.members.map((m) => ({ ...m })),
    };
  }

  return { version: 1, members: [] };
}

async function writeFile(file: MembersFile): Promise<void> {
  const snapshot: MembersFile = {
    version: 1,
    members: file.members.map((m) => ({ ...m })),
  };
  membersCache = snapshot;

  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(membersPath(), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export async function listMembers(): Promise<PublicMember[]> {
  const file = await readFile();
  return file.members.map(toPublicMember);
}

/** Full records for JSON export (includes password hashes). Super-only API. */
export async function exportMembers(): Promise<MemberRecord[]> {
  const file = await readFile();
  return file.members.map((member) => ({ ...member }));
}

export async function findMemberByUsername(username: string): Promise<MemberRecord | null> {
  const normalized = username.trim();
  if (!normalized) return null;
  const file = await readFile();
  return (
    file.members.find((m) => m.username.toLowerCase() === normalized.toLowerCase()) ?? null
  );
}

export async function updateMemberPasswordHash(
  memberId: string,
  passwordHash: string,
): Promise<void> {
  const file = await readFile();
  const index = file.members.findIndex((m) => m.id === memberId);
  if (index < 0) return;
  file.members[index] = { ...file.members[index]!, passwordHash };
  await writeFile(file);
}

export async function remapMemberAdminDept(fromDept: string, toDept: string): Promise<number> {
  const from = fromDept.trim();
  const to = toDept.trim();
  if (!from || !to || from === to) return 0;

  const file = await readFile();
  let changed = 0;
  const members = file.members.map((member) => {
    if (member.adminDept !== from) return member;
    changed += 1;
    return { ...member, adminDept: to };
  });
  if (changed > 0) await writeFile({ version: 1, members });
  return changed;
}

export type MemberUpsertInput = {
  id?: string;
  username: string;
  password?: string;
  passwordHash?: string;
  role: UserRole;
  adminDept?: string;
  disabled?: boolean;
  displayName?: string;
  delete?: boolean;
};

export async function replaceMembers(inputs: MemberUpsertInput[]): Promise<PublicMember[]> {
  const current = await readFile();
  const byId = new Map(current.members.map((m) => [m.id, m]));
  const next: MemberRecord[] = [];
  const seenUsernames = new Set<string>();

  for (const input of inputs) {
    if (input.delete && input.id) {
      byId.delete(input.id);
      continue;
    }

    const username = input.username.trim();
    if (!username) throw new Error('아이디를 입력하세요.');
    const role = normalizeMemberRole(input.role);
    if (!role) throw new Error('역할이 올바르지 않습니다.');

    const usernameKey = username.toLowerCase();
    if (seenUsernames.has(usernameKey)) {
      throw new Error(`중복된 아이디입니다: ${username}`);
    }
    seenUsernames.add(usernameKey);

    const existing = input.id ? byId.get(input.id) : undefined;
    const id = existing?.id ?? input.id ?? randomBytes(8).toString('hex');

    let passwordHash = existing?.passwordHash ?? '';
    if (typeof input.password === 'string' && input.password.length > 0) {
      passwordHash = hashPassword(input.password);
    } else if (typeof input.passwordHash === 'string' && input.passwordHash.trim()) {
      passwordHash = input.passwordHash.trim();
    }
    if (!passwordHash) {
      throw new Error(`${username}: 비밀번호가 필요합니다.`);
    }

    const displayName =
      typeof input.displayName === 'string' && input.displayName.trim()
        ? input.displayName.trim()
        : undefined;

    next.push({
      id,
      username,
      passwordHash,
      role,
      ...(displayName ? { displayName } : {}),
      disabled: Boolean(input.disabled),
    });
  }

  await writeFile({ version: 1, members: next });
  return next.map(toPublicMember);
}

/** Full replace from UI (list of create/update; omit deleted). */
export async function saveMembersList(inputs: MemberUpsertInput[]): Promise<PublicMember[]> {
  return replaceMembers(inputs.filter((m) => !m.delete));
}
