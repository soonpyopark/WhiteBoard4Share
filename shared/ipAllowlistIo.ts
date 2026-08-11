import { normalizeAllowedIpCidrs, type AllowedIpEntry } from './ipCidrCore.ts';

export const IP_ALLOWLIST_KIND = 'whiteboard4share-ip-allowlist';
export const IP_ALLOWLIST_VERSION = 1;

const COMPAT_KINDS = new Set([
  IP_ALLOWLIST_KIND,
  'nas4usb-ip-allowlist',
  'nas4usb-security',
  'my-desktop-calendar-security',
]);

export function buildIpAllowlistPayload(
  allowedIpCidrs: AllowedIpEntry[],
  exportedAt = new Date().toISOString(),
) {
  return {
    kind: IP_ALLOWLIST_KIND,
    version: IP_ALLOWLIST_VERSION,
    exportedAt,
    allowedIpCidrs: normalizeAllowedIpCidrs(allowedIpCidrs),
  };
}

export function parseIpAllowlistPayload(text: string): { allowedIpCidrs: AllowedIpEntry[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('올바른 JSON 파일이 아닙니다.');
  }

  let list: unknown;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const record = parsed as { kind?: unknown; allowedIpCidrs?: unknown };
    if (record.kind != null && !COMPAT_KINDS.has(String(record.kind))) {
      throw new Error('접근 가능 IP 대역 파일이 아닙니다.');
    }
    if (!('allowedIpCidrs' in record)) {
      throw new Error('allowedIpCidrs 항목이 없습니다.');
    }
    list = record.allowedIpCidrs;
  } else {
    throw new Error('IP 대역 파일 형식을 인식할 수 없습니다.');
  }

  const allowedIpCidrs = normalizeAllowedIpCidrs(list);
  if (Array.isArray(list) && list.length > 0 && allowedIpCidrs.length === 0) {
    throw new Error('유효한 허용 IP 항목이 없습니다.');
  }

  return { allowedIpCidrs };
}

export function ipAllowlistExportFilename(date = new Date()): string {
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
  return `whiteboard4share-ip-allowlist-${stamp}.json`;
}
