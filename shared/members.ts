import type { UserRole } from './auth.ts';

export type MemberRecord = {
  id: string;
  username: string;
  /** scrypt hash as salt:hash hex, or empty when password must be set */
  passwordHash: string;
  role: UserRole;
  adminDept?: string;
  disabled?: boolean;
  displayName?: string;
};

export type PublicMember = Omit<MemberRecord, 'passwordHash'> & {
  hasPassword: boolean;
};

export function memberRoleToLabel(role: UserRole): string {
  if (role === 'super') return '총괄관리자';
  return '일반사용자';
}

/** Accepts legacy `dept` (폴더관리자) and stores it as 일반사용자. */
export function normalizeMemberRole(value: unknown): UserRole | null {
  if (value === 'super' || value === 'user') return value;
  if (value === 'dept') return 'user';
  return null;
}

export function toPublicMember(member: MemberRecord): PublicMember {
  const { passwordHash, ...rest } = member;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash),
  };
}
