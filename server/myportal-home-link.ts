export type HomeLinkTarget = 'self' | 'blank';

export function parseHomeLinkTarget(raw: string | undefined): HomeLinkTarget {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === 'blank' ||
    normalized === 'new' ||
    normalized === '_blank' ||
    normalized === 'newtab' ||
    normalized === 'new_tab'
  ) {
    return 'blank';
  }
  return 'self';
}

export function isKeycloakSsoEnabled(): boolean {
  return process.env.KEYCLOAK_ENABLED === 'true';
}

function myPortalPort(): string {
  return (
    process.env.MYPORTAL_PORT?.trim() ||
    process.env.PORTAL_PORT?.trim() ||
    '3001'
  );
}

function fixedMyPortalHomeUrl(): string | undefined {
  const url =
    process.env.MYPORTAL_HOME_URL?.trim() || process.env.HOME_URL?.trim();
  return url || undefined;
}

function useDynamicMyPortalHost(): boolean {
  if (process.env.MYPORTAL_DYNAMIC_ORIGIN === 'false') return false;
  if (process.env.MYPORTAL_DYNAMIC_ORIGIN === 'true') return true;
  return process.env.KEYCLOAK_DYNAMIC_ORIGIN !== 'false';
}

function hostnameFromHostHeader(hostHeader: string): string {
  const hostPart = hostHeader.split(',')[0].trim();
  if (!hostPart) return 'localhost';
  return hostPart.includes(':')
    ? hostPart.slice(0, hostPart.lastIndexOf(':'))
    : hostPart;
}

/** KEYCLOAK_ENABLED=true 일 때만 MyPortal 메인 URL. standalone 이면 null. */
export function resolveMyPortalHomeUrl(options?: {
  hostHeader?: string | null;
  forwardedProto?: string | null;
}): string | null {
  if (!isKeycloakSsoEnabled()) return null;

  const fixed = fixedMyPortalHomeUrl();
  const dynamic = useDynamicMyPortalHost();
  const hostHeader = options?.hostHeader?.trim();

  if (hostHeader && dynamic) {
    const hostname = hostnameFromHostHeader(hostHeader);
    const port =
      process.env.MYPORTAL_PORT?.trim() ||
      (fixed
        ? (() => {
            try {
              return new URL(fixed).port;
            } catch {
              return '';
            }
          })()
        : '') ||
      process.env.PORTAL_PORT?.trim() ||
      '3001';
    const proto =
      options?.forwardedProto?.split(',')[0].trim() ||
      (fixed
        ? (() => {
            try {
              return new URL(fixed).protocol.replace(':', '');
            } catch {
              return 'http';
            }
          })()
        : 'http');
    return `${proto}://${hostname}:${port}`;
  }

  if (fixed) return fixed;

  const port = myPortalPort();
  return `http://localhost:${port}`;
}

export function getHomeLinkConfig(options?: {
  hostHeader?: string | null;
  forwardedProto?: string | null;
}): { url: string | null; target: HomeLinkTarget } {
  const url = resolveMyPortalHomeUrl(options);
  const targetRaw =
    process.env.HOME_TARGET?.trim() || process.env.MYPORTAL_HOME_TARGET?.trim();

  return {
    url,
    target: parseHomeLinkTarget(targetRaw),
  };
}
