import { apiRequest } from './client.ts';
import type { AllowedIpEntry } from '../../shared/ipCidrCore.ts';
import type { PublicMember } from '../../shared/members.ts';
import type { WebServerMode } from '../../shared/webServerConfig.ts';
import type { UserRole } from '../../shared/auth.ts';

export type AppSettingsDto = {
  dataRoot?: string;
  webServerPort?: number;
  webServerMode?: WebServerMode;
  allowedIpCidrs: AllowedIpEntry[];
  themeAccentColor?: string;
  dataDir: string;
  defaultAccentColor: string;
  dataRootState?: {
    configured: string | null;
    effective: string;
    defaultDataRoot: string;
    canEdit: boolean;
  };
};

export type ServerInfoDto = {
  running: boolean;
  port: number | null;
  configuredPort: number;
  mode: WebServerMode;
  hostname: string;
  addresses: string[];
  appUrl: string | null;
  canControl: boolean;
};

export type MemberUpsertDto = {
  id?: string;
  username: string;
  password?: string;
  passwordHash?: string;
  role: UserRole;
  adminDept?: string;
  disabled?: boolean;
  displayName?: string;
};

export function fetchSettings(): Promise<AppSettingsDto> {
  return apiRequest<AppSettingsDto>('/settings');
}

export function fetchTheme(): Promise<{ accentColor: string }> {
  return apiRequest<{ accentColor: string }>('/settings/theme');
}

export function updateSettingsApi(
  patch: Partial<{
    allowedIpCidrs: AllowedIpEntry[];
    themeAccentColor: string | null;
    dataRoot: string | null;
    webServerPort: number | null;
    webServerMode: WebServerMode | null;
  }>,
): Promise<AppSettingsDto> {
  return apiRequest<AppSettingsDto>('/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function fetchServerInfo(): Promise<ServerInfoDto> {
  return apiRequest<ServerInfoDto>('/server/info');
}

export function applyServerConfig(patch: {
  port?: number;
  mode?: WebServerMode;
}): Promise<{ restarted: boolean; info: ServerInfoDto }> {
  return apiRequest('/server/config', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function allowFirewall(port: number): Promise<{ ok: boolean; message: string; port: number }> {
  return apiRequest('/server/firewall/allow', {
    method: 'POST',
    body: JSON.stringify({ port }),
  });
}

export function removeFirewall(port: number): Promise<{ ok: boolean; message: string; port: number }> {
  return apiRequest('/server/firewall/remove', {
    method: 'POST',
    body: JSON.stringify({ port }),
  });
}

export function fetchMembers(): Promise<{ members: PublicMember[] }> {
  return apiRequest('/members');
}

export function exportMembersApi(): Promise<{
  kind: string;
  version: number;
  exportedAt: string;
  members: MemberUpsertDto[];
}> {
  return apiRequest('/members/export');
}

export function saveMembers(members: MemberUpsertDto[]): Promise<{ members: PublicMember[] }> {
  return apiRequest('/members', {
    method: 'PUT',
    body: JSON.stringify({ members }),
  });
}
