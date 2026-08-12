import { normalizeMemberRole, type MemberRecord } from './members.ts';
import type { UserRole } from './auth.ts';

export const MEMBERS_EXPORT_KIND = 'whiteboard4share-members';
export const MEMBERS_EXPORT_VERSION = 1;

export type MembersExportItem = {
  id?: string;
  username: string;
  displayName?: string;
  role: UserRole;
  disabled?: boolean;
  passwordHash?: string;
  password?: string;
};

export type MembersExportPayload = {
  kind: typeof MEMBERS_EXPORT_KIND;
  version: number;
  exportedAt: string;
  members: MembersExportItem[];
};

export function buildMembersExportPayload(
  members: Array<Pick<MemberRecord, 'id' | 'username' | 'role' | 'passwordHash'> & {
    displayName?: string;
    disabled?: boolean;
  }>,
  exportedAt = new Date().toISOString(),
): MembersExportPayload {
  return {
    kind: MEMBERS_EXPORT_KIND,
    version: MEMBERS_EXPORT_VERSION,
    exportedAt,
    members: members.map((member) => ({
      id: member.id,
      username: member.username,
      role: member.role === 'super' ? 'super' : 'user',
      ...(member.displayName?.trim() ? { displayName: member.displayName.trim() } : {}),
      ...(member.disabled ? { disabled: true } : {}),
      ...(member.passwordHash ? { passwordHash: member.passwordHash } : {}),
    })),
  };
}

export function parseMembersExportPayload(text: string): { members: MembersExportItem[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('올바른 JSON 파일이 아닙니다.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('회원 관리 파일 형식을 인식할 수 없습니다.');
  }

  const record = parsed as { kind?: unknown; members?: unknown };
  if (record.kind != null && String(record.kind) !== MEMBERS_EXPORT_KIND) {
    throw new Error('회원 관리 파일이 아닙니다.');
  }
  if (!Array.isArray(record.members)) {
    throw new Error('members 항목이 없습니다.');
  }

  const members: MembersExportItem[] = [];
  const seen = new Set<string>();
  for (const raw of record.members) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const username =
      typeof item.username === 'string'
        ? item.username.trim()
        : typeof item.loginId === 'string'
          ? item.loginId.trim()
          : '';
    if (!username) continue;
    const key = username.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`파일에 중복된 아이디가 있습니다: ${username}`);
    }
    seen.add(key);

    const role = normalizeMemberRole(item.role) ?? 'user';
    const displayName =
      typeof item.displayName === 'string' && item.displayName.trim()
        ? item.displayName.trim()
        : undefined;
    const passwordHash =
      typeof item.passwordHash === 'string' && item.passwordHash.trim()
        ? item.passwordHash.trim()
        : undefined;
    const password =
      typeof item.password === 'string' && item.password.trim()
        ? item.password.trim()
        : undefined;

    if (!passwordHash && !password) {
      throw new Error(`${username}: 비밀번호 또는 비밀번호 해시가 필요합니다.`);
    }

    members.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined,
      username,
      role,
      ...(displayName ? { displayName } : {}),
      disabled: item.active === false || item.disabled === true,
      ...(passwordHash ? { passwordHash } : {}),
      ...(password ? { password } : {}),
    });
  }

  if (members.length === 0) {
    throw new Error('가져올 회원 항목이 없습니다.');
  }

  return { members };
}

export function membersExportFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
  return `whiteboard4share-members-${stamp}.json`;
}
