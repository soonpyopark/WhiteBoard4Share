import type { Request } from 'express';
import type { KeycloakConfig } from './config.ts';

export function parseAllowedHosts(raw?: string): string[] {
  const value =
    raw ??
    process.env.KEYCLOAK_ALLOWED_HOSTS ??
    'localhost,127.0.0.1,192.168.0.162,xwind.iptime.org';
  return value
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function resolveProtocol(req: Request): string {
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return 'http';
}

export function resolveRequestAppBaseUrl(
  req: Request,
  defaultPort: number,
  allowedHosts: string[],
): string | null {
  const hostHeader =
    (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  if (!hostHeader) return null;

  const hostPart = hostHeader.split(',')[0].trim();
  const hostname = hostPart.includes(':')
    ? hostPart.slice(0, hostPart.lastIndexOf(':'))
    : hostPart;
  const port = hostPart.includes(':')
    ? hostPart.slice(hostPart.lastIndexOf(':') + 1)
    : String(defaultPort);

  if (allowedHosts.length > 0 && !allowedHosts.includes(hostname.toLowerCase())) {
    return null;
  }

  return `${resolveProtocol(req)}://${hostname}:${port}`;
}

export function resolveKeycloakPublicUrl(hostname: string, keycloakUrl: string): string {
  const parsed = new URL(keycloakUrl);
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '3000');
  const showPort =
    (parsed.protocol === 'http:' && port !== '80') ||
    (parsed.protocol === 'https:' && port !== '443');
  return showPort
    ? `${parsed.protocol}//${hostname}:${port}`
    : `${parsed.protocol}//${hostname}`;
}

export function withRequestOrigin(
  base: KeycloakConfig,
  req: Request,
  appPort: number,
): KeycloakConfig {
  if (!base.dynamicOrigin) return base;

  const appBaseUrl = resolveRequestAppBaseUrl(req, appPort, base.allowedHosts);
  if (!appBaseUrl) return base;

  const hostname = new URL(appBaseUrl).hostname;
  return {
    ...base,
    appBaseUrl,
    url: resolveKeycloakPublicUrl(hostname, base.url),
  };
}
