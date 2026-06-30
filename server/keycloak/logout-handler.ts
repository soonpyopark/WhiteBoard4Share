import type { Request, Response } from 'express';
import {
  clearAuthCookie,
  cookieSecure,
  getSessionFromRequest,
  parseCookieHeader,
} from '../auth.ts';
import { getKeycloakConfig } from './config.ts';
import { withRequestOrigin } from './request-origin.ts';
import {
  buildKeycloakLogoutFormHtml,
  KEYCLOAK_ID_TOKEN_COOKIE,
  KEYCLOAK_STATE_COOKIE,
} from './oidc.ts';

function clearKeycloakCookies(res: Response, req: Request): void {
  const secure = cookieSecure(req);
  const cleared = `Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  res.append('Set-Cookie', `${KEYCLOAK_ID_TOKEN_COOKIE}=; ${cleared}`);
  res.append('Set-Cookie', `${KEYCLOAK_STATE_COOKIE}=; ${cleared}`);
}

export function handleKeycloakLogout(req: Request, res: Response): void {
  const base = getKeycloakConfig();
  const port = parseInt(process.env.PORT ?? '3007', 10);
  const config = withRequestOrigin(base, req, port);

  const cookies = parseCookieHeader(req.headers.cookie);
  const session = getSessionFromRequest(req);
  const idToken = cookies[KEYCLOAK_ID_TOKEN_COOKIE];

  clearAuthCookie(res, req);
  clearKeycloakCookies(res, req);

  const isKeycloakSession =
    config.enabled && (session?.source === 'keycloak' || Boolean(idToken));

  if (isKeycloakSession) {
    res
      .status(200)
      .type('html')
      .send(buildKeycloakLogoutFormHtml(config, idToken));
    return;
  }

  res.redirect(`${config.appBaseUrl}/`);
}
