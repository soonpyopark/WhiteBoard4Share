import { randomBytes } from 'node:crypto';
import type { KeycloakConfig } from './config.ts';
import {
  getKeycloakIssuer,
  getKeycloakPostLogoutRedirectUri,
  getKeycloakRedirectUri,
} from './config.ts';
import type { UserRole } from '../../shared/auth.ts';

export const KEYCLOAK_STATE_COOKIE = 'wb_kc_oauth_state';
export const KEYCLOAK_ID_TOKEN_COOKIE = 'wb_kc_id_token';

interface JwtPayload {
  exp?: number;
  preferred_username?: string;
  sub?: string;
  realm_access?: { roles?: string[] };
  dept_code?: string;
}

export function createOAuthState(): string {
  return randomBytes(24).toString('hex');
}

export function buildKeycloakAuthUrl(config: KeycloakConfig, state: string): string {
  const issuer = getKeycloakIssuer(config);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getKeycloakRedirectUri(config),
    response_type: 'code',
    scope: 'openid profile email',
    state,
  });
  return `${issuer}/protocol/openid-connect/auth?${params.toString()}`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function buildKeycloakLogoutFormHtml(config: KeycloakConfig, idToken?: string): string {
  const action = `${getKeycloakIssuer(config)}/protocol/openid-connect/logout`;
  const postLogoutUri = getKeycloakPostLogoutRedirectUri(config);
  let idTokenField = '';
  const useIdTokenHint = process.env.KEYCLOAK_LOGOUT_ID_TOKEN_HINT !== 'false';
  if (useIdTokenHint && idToken) {
    try {
      const claims = decodeJwtPayload(idToken);
      if (typeof claims.exp === 'number' && claims.exp * 1000 > Date.now()) {
        idTokenField = `<input type="hidden" name="id_token_hint" value="${escapeHtmlAttr(idToken)}"/>`;
      }
    } catch {
      /* omit invalid id_token_hint */
    }
  }
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/><title>로그아웃</title></head>
<body>
<form id="kc-logout" method="post" action="${escapeHtmlAttr(action)}">
  <input type="hidden" name="client_id" value="${escapeHtmlAttr(config.clientId)}"/>
  <input type="hidden" name="post_logout_redirect_uri" value="${escapeHtmlAttr(postLogoutUri)}"/>
  ${idTokenField}
</form>
<script>document.getElementById('kc-logout').submit();</script>
<noscript><p><button type="submit" form="kc-logout">Keycloak 로그아웃 계속</button></p></noscript>
</body></html>`;
}

export async function exchangeAuthorizationCode(
  config: KeycloakConfig,
  code: string,
): Promise<{ access_token: string; id_token?: string }> {
  const issuer = getKeycloakIssuer({
    ...config,
    url: config.keycloakServerUrl,
  });
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getKeycloakRedirectUri(config),
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Keycloak token exchange failed: ${response.status} ${detail}`);
  }

  return (await response.json()) as { access_token: string; id_token?: string };
}

export function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('Invalid JWT');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JwtPayload;
}

export function extractByDeptCode(username: string, claims: JwtPayload): string | null {
  const fromClaim = claims.dept_code?.trim();
  if (fromClaim) return fromClaim;
  const match = /^admin\.(\d{7})$/.exec(username.trim());
  return match?.[1] ?? null;
}

export function mapKeycloakWhiteboardRole(
  realmRoles: string[],
  config: KeycloakConfig,
): UserRole | null {
  const roles = realmRoles.map((r) => r.toLowerCase());
  const superRole = config.roleSuper.toLowerCase();
  const deptRole = config.roleDept.toLowerCase();

  if (roles.includes(superRole)) return 'super';
  if (roles.includes(deptRole)) return 'user';
  return null;
}

export function getKeycloakUsername(claims: JwtPayload): string {
  return claims.preferred_username?.trim() || claims.sub?.trim() || 'keycloak-user';
}
