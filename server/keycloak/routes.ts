import { Router, type Request, type Response } from 'express';
import {
  createSessionToken,
  cookieSecure,
  setAuthCookie,
} from '../auth.ts';
import { parseCookieHeader } from '../auth.ts';
import { ensureDefaultDepartments, listDepartments } from '../dept.ts';
import { getKeycloakConfig } from './config.ts';
import { withRequestOrigin } from './request-origin.ts';
import { handleKeycloakLogout } from './logout-handler.ts';
import {
  buildKeycloakAuthUrl,
  createOAuthState,
  decodeJwtPayload,
  exchangeAuthorizationCode,
  extractByDeptCode,
  getKeycloakUsername,
  KEYCLOAK_ID_TOKEN_COOKIE,
  KEYCLOAK_STATE_COOKIE,
  mapKeycloakWhiteboardRole,
} from './oidc.ts';

function appPort(): number {
  return parseInt(process.env.PORT ?? '3007', 10);
}

function resolveKeycloakConfig(req: Request) {
  return withRequestOrigin(getKeycloakConfig(), req, appPort());
}

function redirectWithError(res: Response, config: ReturnType<typeof getKeycloakConfig>, code: string): void {
  res.redirect(`${config.appBaseUrl}/?auth_error=${encodeURIComponent(code)}`);
}

function setKeycloakCookie(
  res: Response,
  req: Request,
  name: string,
  value: string,
  maxAge: number,
): void {
  const secure = cookieSecure(req);
  res.setHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`,
  );
}

function clearKeycloakCookie(res: Response, req: Request, name: string): void {
  const secure = cookieSecure(req);
  res.setHeader(
    'Set-Cookie',
    `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
  );
}

export function createKeycloakRouter(): Router {
  const router = Router();

  router.get('/login', (req, res) => {
    const config = resolveKeycloakConfig(req);

    if (!config.enabled) {
      res.status(404).json({ error: 'Keycloak SSO가 비활성화되어 있습니다.' });
      return;
    }

    if (!config.clientSecret) {
      res.status(500).json({ error: 'KEYCLOAK_CLIENT_SECRET 환경변수가 필요합니다.' });
      return;
    }

    const state = createOAuthState();
    setKeycloakCookie(res, req, KEYCLOAK_STATE_COOKIE, state, 600);
    res.redirect(buildKeycloakAuthUrl(config, state));
  });

  router.get('/callback', async (req, res) => {
    const config = resolveKeycloakConfig(req);

    if (!config.enabled) {
      res.redirect(`${config.appBaseUrl}/`);
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const cookies = parseCookieHeader(req.headers.cookie);
    const stateCookie = cookies[KEYCLOAK_STATE_COOKIE];

    if (!code || !state || !stateCookie || state !== stateCookie) {
      redirectWithError(res, config, 'invalid_state');
      return;
    }

    try {
      await ensureDefaultDepartments();
      const tokens = await exchangeAuthorizationCode(config, code);
      const claims = decodeJwtPayload(tokens.access_token);
      const username = getKeycloakUsername(claims);
      const realmRoles = claims.realm_access?.roles ?? [];
      const role = mapKeycloakWhiteboardRole(realmRoles, config);

      if (!role) {
        redirectWithError(res, config, 'no_portal_role');
        return;
      }

      const departments = await listDepartments();
      const defaultDept = departments[0] ?? '0000001';
      let byDept = defaultDept;
      let adminDept: string | undefined;

      if (role === 'dept') {
        byDept = extractByDeptCode(username, claims) ?? defaultDept;
        if (!departments.includes(byDept)) {
          redirectWithError(res, config, 'unknown_dept');
          return;
        }
        adminDept = byDept;
      }

      const sessionInfo = {
        username,
        byDept,
        displayName: username,
        role,
        adminDept,
        source: 'keycloak' as const,
      };
      const token = createSessionToken(sessionInfo);
      setAuthCookie(res, token, req);

      if (tokens.id_token) {
        setKeycloakCookie(res, req, KEYCLOAK_ID_TOKEN_COOKIE, tokens.id_token, 7 * 24 * 60 * 60);
      }

      clearKeycloakCookie(res, req, KEYCLOAK_STATE_COOKIE);
      res.redirect(`${config.appBaseUrl}/?byDept=${encodeURIComponent(byDept)}`);
    } catch (err) {
      console.error(err);
      redirectWithError(res, config, 'token_exchange_failed');
    }
  });

  router.get('/logout', (req, res) => {
    handleKeycloakLogout(req, res);
  });

  return router;
}
