export type WebServerMode = 'local' | 'lan';

const FALLBACK_PORT = 3007;

export function normalizeWebServerPort(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) return null;
  const port = Math.trunc(parsed);
  if (port < 1 || port > 65535) return null;
  return port;
}

export function resolveWebServerPort(preferred: unknown, envRaw?: string | null): number {
  return normalizeWebServerPort(preferred) ?? normalizeWebServerPort(envRaw) ?? FALLBACK_PORT;
}

export function normalizeWebServerMode(value: unknown): WebServerMode | null {
  return value === 'lan' || value === 'local' ? value : null;
}

export function resolveWebServerMode(preferred: unknown, envHostname?: string | null): WebServerMode {
  const stored = normalizeWebServerMode(preferred);
  if (stored) return stored;
  const hostname = String(envHostname ?? '').trim();
  if (hostname === '0.0.0.0' || hostname === '*' || hostname === '+') return 'lan';
  return 'local';
}

export function hostnameForWebServerMode(mode: WebServerMode): string {
  return mode === 'lan' ? '0.0.0.0' : '127.0.0.1';
}

export function webServerModeForHostname(hostname: string | null | undefined): WebServerMode {
  const value = String(hostname ?? '').trim();
  return value === '0.0.0.0' || value === '*' || value === '+' ? 'lan' : 'local';
}
