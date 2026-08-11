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
  if (role === 'dept') return '폴더관리자';
  return '일반사용자';
}

export function normalizeMemberRole(value: unknown): UserRole | null {
  return value === 'super' || value === 'dept' || value === 'user' ? value : null;
}

export function toPublicMember(member: MemberRecord): PublicMember {
  const { passwordHash, ...rest } = member;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash),
  };
}
