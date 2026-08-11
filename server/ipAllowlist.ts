import {
  getAllowedIpCidrStrings,
  ipMatchesCidrRule,
  parseIPv4,
} from '../shared/ipCidrCore.ts';
import { loadSettings } from './settingsService.ts';

export function normalizeClientIp(ip: string): string | null {
  if (!ip || typeof ip !== 'string') return null;
  let trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) trimmed = trimmed.slice(7);
  if (trimmed === '::1') return '127.0.0.1';
  if (trimmed.includes(':')) return null;
  return parseIPv4(trimmed) !== null ? trimmed : null;
}

export function isIpAllowed(clientIp: string, allowedCidrs: unknown): boolean {
  const rules = getAllowedIpCidrStrings(allowedCidrs);
  if (rules.length === 0) return true;

  const normalized = normalizeClientIp(clientIp);
  if (!normalized) return false;
  if (normalized === '127.0.0.1') return true;

  return rules.some((rule) => ipMatchesCidrRule(normalized, rule));
}

export function getClientIpFromRequest(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(',')[0]
      ?.trim();
    if (first) return first;
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(Array.isArray(realIp) ? realIp[0] : realIp).trim();
  return req.socket?.remoteAddress ?? '';
}

export function ipBlockedHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/><title>접속 제한</title>
<style>body{font-family:"Malgun Gothic",system-ui,sans-serif;margin:2rem;background:#eef2f7;color:#0f172a}
.box{max-width:28rem;margin:4rem auto;background:#fff;padding:1.75rem 2rem;border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:.5rem 0;line-height:1.55;color:#475569}</style></head>
<body><div class="box"><h1>접속이 허용되지 않은 IP입니다</h1>
<p>관리자에게 접근 가능 IP 대역 등록을 요청하세요.</p>
<p>서버 PC에서는 <code>127.0.0.1</code> 로 접속할 수 있습니다.</p></div></body></html>`;
}

export async function isRequestIpAllowed(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): Promise<boolean> {
  const settings = await loadSettings();
  return isIpAllowed(getClientIpFromRequest(req), settings.allowedIpCidrs);
}

export function isLocalClientRequest(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): boolean {
  const normalized = normalizeClientIp(getClientIpFromRequest(req));
  return normalized === '127.0.0.1';
}
