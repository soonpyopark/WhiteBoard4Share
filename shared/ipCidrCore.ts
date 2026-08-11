/** IPv4 / CIDR / range validation (browser + server). */

export function parseIPv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number.parseInt(part, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0]! << 24) | (nums[1]! << 16) | (nums[2]! << 8) | nums[3]!) >>> 0;
}

type IpRule =
  | { type: 'cidr'; network: number; mask: number }
  | { type: 'range'; start: number; end: number };

function parseCidrPart(entry: string): IpRule | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  if (!trimmed.includes('/')) {
    const ip = parseIPv4(trimmed);
    if (ip === null) return null;
    return { type: 'cidr', network: ip, mask: 0xffffffff };
  }

  const slash = trimmed.lastIndexOf('/');
  const ipPart = trimmed.slice(0, slash).trim();
  const prefixPart = trimmed.slice(slash + 1).trim();
  const prefix = Number.parseInt(prefixPart, 10);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return null;

  const ip = parseIPv4(ipPart);
  if (ip === null) return null;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { type: 'cidr', network: (ip & mask) >>> 0, mask };
}

function parseIpRangePart(entry: string): IpRule | null {
  const trimmed = entry.trim();
  if (!trimmed.includes('-') || trimmed.includes('/')) return null;

  const dashIndex = trimmed.indexOf('-');
  const startPart = trimmed.slice(0, dashIndex).trim();
  const endPart = trimmed.slice(dashIndex + 1).trim();
  if (!startPart || !endPart || endPart.includes('-')) return null;

  const start = parseIPv4(startPart);
  const end = parseIPv4(endPart);
  if (start === null || end === null || start > end) return null;

  return { type: 'range', start, end };
}

function parseIpRule(entry: string): IpRule | null {
  if (typeof entry !== 'string') return null;
  const trimmed = entry.trim();
  if (!trimmed) return null;

  if (trimmed.includes('/')) return parseCidrPart(trimmed);
  if (trimmed.includes('-')) return parseIpRangePart(trimmed);
  return parseCidrPart(trimmed);
}

export function isValidIpOrCidr(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return parseIpRule(value) !== null;
}

export type AllowedIpEntry = { cidr: string; description?: string };

export function normalizeAllowedIpCidrs(list: unknown): AllowedIpEntry[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: AllowedIpEntry[] = [];
  for (const item of list) {
    let cidr = '';
    let description = '';

    if (typeof item === 'string') {
      cidr = item.trim();
    } else if (item && typeof item === 'object' && typeof (item as { cidr?: unknown }).cidr === 'string') {
      cidr = String((item as { cidr: string }).cidr).trim();
      if (typeof (item as { description?: unknown }).description === 'string') {
        description = String((item as { description: string }).description).trim();
      }
    } else {
      continue;
    }

    if (!cidr || !isValidIpOrCidr(cidr)) continue;
    const key = cidr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(description ? { cidr, description } : { cidr });
  }
  return result;
}

export function getAllowedIpCidrStrings(list: unknown): string[] {
  return normalizeAllowedIpCidrs(list).map((entry) => entry.cidr);
}

export function ipMatchesCidrRule(ipString: string, cidrRule: string): boolean {
  const ipNum = parseIPv4(ipString);
  if (ipNum === null) return false;
  const rule = parseIpRule(cidrRule);
  if (!rule) return false;
  if (rule.type === 'range') {
    return ipNum >= rule.start && ipNum <= rule.end;
  }
  return ((ipNum & rule.mask) >>> 0) === rule.network;
}
