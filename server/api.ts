import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  authenticateUser,
  clearAuthCookie,
  createSessionToken,
  getSessionFromRequest,
  sessionCanCreate,
  setAuthCookie,
  type SessionPayload,
} from './auth.ts';
import {
  canCreateOrDeleteFolders,
  canCreateWhiteboard,
  canRenameFolder,
  canViewWhiteboardInGallery,
} from '../shared/auth.ts';
import { normalizeAllowedIpCidrs } from '../shared/ipCidrCore.ts';
import { normalizeMemberRole } from '../shared/members.ts';
import {
  normalizeWebServerMode,
  normalizeWebServerPort,
  type WebServerMode,
} from '../shared/webServerConfig.ts';
import { ensureDefaultDepartments, isValidDeptCode, listDepartments } from './dept.ts';
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  reorderFolders,
} from './foldersService.ts';
import { allowFirewallInbound, removeFirewallInbound } from './firewallService.ts';
import { isLocalClientRequest } from './ipAllowlist.ts';
import { getKeycloakConfig } from './keycloak/config.ts';
import { createKeycloakRouter } from './keycloak/routes.ts';
import { listMembers, saveMembersList, type MemberUpsertInput } from './membersService.ts';
import { getHomeLinkConfig } from './myportal-home-link.ts';
import { getPublicSettings, getThemeAccentColor, updateSettings } from './settingsService.ts';
import {
  copyWhiteboard,
  createShareLink,
  createWhiteboard,
  deleteWhiteboard,
  getWhiteboard,
  hasShareTokenAccess,
  listWhiteboards,
  renameWhiteboard,
  reorderWhiteboards,
  revokeShareLink,
  resolveShareLink,
  saveWhiteboard,
  updateWhiteboardVisibility,
} from './storage.ts';

// Avoid circular import with startServer at module load time
async function serverRuntime() {
  return import('./startServer.ts');
}

type AuthedRequest = Request & {
  session?: SessionPayload;
  byDept?: string;
};

function resolveByDept(req: AuthedRequest): string | null {
  const fromQuery = req.query.byDept;
  if (typeof fromQuery === 'string' && isValidDeptCode(fromQuery)) {
    return fromQuery.trim();
  }
  return req.session?.byDept ?? null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: '로그인이 필요합니다' });
    return;
  }
  req.session = session;
  next();
}

function requireDept(req: AuthedRequest, res: Response, next: NextFunction): void {
  const byDept = resolveByDept(req);
  if (!byDept) {
    res.status(400).json({ error: 'byDept required' });
    return;
  }
  req.byDept = byDept;
  next();
}

function requireCreatePermission(req: AuthedRequest, res: Response, next: NextFunction): void {
  const session = req.session;
  if (!session || !sessionCanCreate(session)) {
    res.status(403).json({ error: '화이트보드 생성 권한이 없습니다' });
    return;
  }
  next();
}

function requireSuper(req: AuthedRequest, res: Response, next: NextFunction): void {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: '로그인이 필요합니다' });
    return;
  }
  if (session.role !== 'super') {
    res.status(403).json({ error: '환경설정은 총괄관리자만 이용할 수 있습니다.' });
    return;
  }
  req.session = session;
  next();
}

function requireLocalServerControl(req: Request, res: Response, next: NextFunction): void {
  if (!isLocalClientRequest(req)) {
    res.status(403).json({
      error:
        '서버 설정 변경은 서버 PC의 로컬(127.0.0.1) 접속에서만 가능합니다.',
    });
    return;
  }
  next();
}

function sessionResponse(session: SessionPayload) {
  return {
    authenticated: true,
    username: session.username,
    byDept: session.byDept,
    displayName: session.displayName,
    role: session.role,
    adminDept: session.adminDept,
    source: session.source,
    canCreateWhiteboard: canCreateWhiteboard(session),
  };
}

function authConfigResponse(req: Request) {
  const kc = getKeycloakConfig();
  const home = getHomeLinkConfig({
    hostHeader:
      (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? null,
    forwardedProto:
      typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto']
        : null,
  });
  return {
    keycloakEnabled: kc.enabled,
    keycloakLoginUrl: kc.enabled ? '/api/auth/keycloak/login' : null,
    allowLocalLogin: kc.allowLocal,
    homeUrl: home.url,
    homeTarget: home.target,
  };
}

function getShareTokenFromRequest(req: Request): string | null {
  const header = req.headers['x-share-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const query = req.query.shareToken;
  if (typeof query === 'string' && query.trim()) return query.trim();
  return null;
}

function canAccessWhiteboardDoc(
  session: SessionPayload,
  byDept: string,
  doc: NonNullable<Awaited<ReturnType<typeof getWhiteboard>>>,
  shareToken: string | null,
): boolean {
  if (hasShareTokenAccess(doc, shareToken)) return true;
  return canViewWhiteboardInGallery(session, doc, byDept);
}

export function createApiRouter(): Router {
  const router = Router();

  void ensureDefaultDepartments();

  router.get('/departments', async (_req, res) => {
    try {
      await ensureDefaultDepartments();
      const [departments, folders] = await Promise.all([listDepartments(), listFolders()]);
      res.json({ departments, folders });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '폴더 목록을 불러오지 못했습니다' });
    }
  });

  router.get('/folders', async (_req, res) => {
    try {
      await ensureDefaultDepartments();
      const folders = await listFolders();
      res.json({ folders });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '폴더 목록을 불러오지 못했습니다' });
    }
  });

  router.get('/auth/session', (req, res) => {
    const session = getSessionFromRequest(req);
    const config = authConfigResponse(req);
    if (!session) {
      res.json({ authenticated: false, ...config });
      return;
    }
    res.json({ ...sessionResponse(session), ...config });
  });

  router.use('/auth/keycloak', createKeycloakRouter());

  router.post('/auth/login', async (req, res) => {
    try {
      const kc = getKeycloakConfig();
      if (kc.enabled && !kc.allowLocal) {
        res.status(403).json({ error: 'Keycloak SSO 로그인을 사용하세요.' });
        return;
      }

      const { username, password, byDept, displayName } = req.body as {
        username?: string;
        password?: string;
        byDept?: string;
        displayName?: string;
      };

      const normalizedDept = byDept?.trim() ?? '';
      if (!isValidDeptCode(normalizedDept)) {
        res.status(400).json({ error: '유효한 폴더를 선택하세요' });
        return;
      }

      const normalizedUsername = username?.trim() ?? '';
      const normalizedPassword = password ?? '';
      if (!normalizedUsername || !normalizedPassword) {
        res.status(400).json({ error: '아이디와 비밀번호를 입력하세요' });
        return;
      }

      await ensureDefaultDepartments();

      const authUser = await authenticateUser(
        normalizedUsername,
        normalizedPassword,
        normalizedDept,
      );
      if (!authUser) {
        res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
        return;
      }

      const sessionInfo = {
        username: authUser.username,
        byDept: normalizedDept,
        displayName: displayName?.trim() || authUser.username,
        role: authUser.role,
        adminDept: authUser.adminDept,
        source: 'local' as const,
      };
      const token = createSessionToken(sessionInfo);
      setAuthCookie(res, token, req);

      res.json({ ok: true, ...sessionResponse({ ...sessionInfo, exp: 0 }) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  router.post('/auth/switch-dept', requireAuth, async (req, res) => {
    try {
      const authedReq = req as AuthedRequest;
      const { byDept } = req.body as { byDept?: string };
      const normalizedDept = byDept?.trim() ?? '';
      if (!isValidDeptCode(normalizedDept)) {
        res.status(400).json({ error: '유효한 폴더를 선택하세요' });
        return;
      }

      await ensureDefaultDepartments();
      const departments = await listDepartments();
      if (!departments.includes(normalizedDept)) {
        res.status(404).json({ error: '폴더를 찾을 수 없습니다' });
        return;
      }

      const session = authedReq.session!;
      const sessionInfo = {
        username: session.username,
        byDept: normalizedDept,
        displayName: session.displayName,
        role: session.role,
        adminDept: session.adminDept,
        source: session.source,
      };
      const token = createSessionToken(sessionInfo);
      setAuthCookie(res, token, req);

      res.json({ ok: true, ...sessionResponse({ ...sessionInfo, exp: 0 }) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to switch department' });
    }
  });

  router.post('/auth/logout', (req, res) => {
    clearAuthCookie(res, req);
    res.json({ ok: true });
  });

  router.post('/auth/join', async (req, res) => {
    try {
      const { displayName, byDept } = req.body as {
        displayName?: string;
        byDept?: string;
      };

      const normalizedDept = byDept?.trim() ?? '';
      if (!isValidDeptCode(normalizedDept)) {
        res.status(400).json({ error: '유효한 폴더를 선택하세요' });
        return;
      }

      await ensureDefaultDepartments();
      const departments = await listDepartments();
      if (!departments.includes(normalizedDept)) {
        res.status(404).json({ error: '폴더를 찾을 수 없습니다' });
        return;
      }

      const trimmedName = displayName?.trim() ?? '';
      if (!trimmedName) {
        res.status(400).json({ error: '사용자 이름을 입력하세요' });
        return;
      }

      const sessionInfo = {
        username: trimmedName,
        byDept: normalizedDept,
        displayName: trimmedName,
        role: 'user' as const,
        source: 'local' as const,
      };
      const token = createSessionToken(sessionInfo);
      setAuthCookie(res, token, req);

      res.json({ ok: true, ...sessionResponse({ ...sessionInfo, exp: 0 }) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '참여에 실패했습니다' });
    }
  });

  router.get('/share/:token', async (req, res) => {
    try {
      const info = await resolveShareLink(req.params.token);
      if (!info) {
        res.status(404).json({ error: '공유 링크를 찾을 수 없습니다' });
        return;
      }
      res.json(info);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to resolve share link' });
    }
  });

  // Public: accent must apply before login (matches NAS4USB /api/settings/theme).
  router.get('/settings/theme', async (_req, res) => {
    try {
      res.json({ accentColor: await getThemeAccentColor() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '테마를 불러오지 못했습니다' });
    }
  });

  router.use(requireAuth);
  router.use(requireDept);

  router.post('/folders', async (req, res) => {
    try {
      const session = (req as AuthedRequest).session!;
      if (!canCreateOrDeleteFolders(session)) {
        res.status(403).json({ error: '폴더 생성은 총괄관리자만 할 수 있습니다.' });
        return;
      }
      const body = req.body as { name?: unknown };
      const folder = await createFolder(body.name);
      res.status(201).json({ folder, folders: await listFolders() });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      if (status >= 400 && status < 500) {
        res.status(status).json({ error: err instanceof Error ? err.message : '폴더 생성 실패' });
        return;
      }
      console.error(err);
      res.status(500).json({ error: '폴더를 만들지 못했습니다' });
    }
  });

  router.put('/folders/order', async (req, res) => {
    try {
      const session = (req as AuthedRequest).session!;
      if (!canCreateOrDeleteFolders(session)) {
        res.status(403).json({ error: '폴더 순서 변경은 총괄관리자만 할 수 있습니다.' });
        return;
      }
      const body = req.body as { ids?: unknown };
      const folders = await reorderFolders(body.ids);
      res.json({ folders });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      if (status >= 400 && status < 500) {
        res.status(status).json({ error: err instanceof Error ? err.message : '폴더 순서 변경 실패' });
        return;
      }
      console.error(err);
      res.status(500).json({ error: '폴더 순서를 바꾸지 못했습니다' });
    }
  });

  router.patch('/folders/:id', async (req, res) => {
    try {
      const session = (req as AuthedRequest).session!;
      const folderId = String(req.params.id ?? '');
      if (!canRenameFolder(session, folderId)) {
        res.status(403).json({ error: '이 폴더의 이름을 바꿀 권한이 없습니다.' });
        return;
      }
      const body = req.body as { name?: unknown };
      const result = await renameFolder(folderId, body.name);
      res.json(result);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      if (status >= 400 && status < 500) {
        res.status(status).json({ error: err instanceof Error ? err.message : '폴더 이름 변경 실패' });
        return;
      }
      console.error(err);
      res.status(500).json({ error: '폴더 이름을 바꾸지 못했습니다' });
    }
  });

  router.delete('/folders/:id', async (req, res) => {
    try {
      const session = (req as AuthedRequest).session!;
      if (!canCreateOrDeleteFolders(session)) {
        res.status(403).json({ error: '폴더 삭제는 총괄관리자만 할 수 있습니다.' });
        return;
      }
      const folderId = String(req.params.id ?? '');
      const force =
        req.query.force === '1' ||
        req.query.force === 'true' ||
        (req.body as { force?: unknown } | undefined)?.force === true;
      const result = await deleteFolder(folderId, { force });
      res.json({ ...result, folders: await listFolders() });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      if (status >= 400 && status < 500) {
        res.status(status).json({
          error: err instanceof Error ? err.message : '폴더 삭제 실패',
          boardCount: (err as { boardCount?: number }).boardCount,
        });
        return;
      }
      console.error(err);
      res.status(500).json({ error: '폴더를 삭제하지 못했습니다' });
    }
  });

  router.get('/whiteboards', async (req, res) => {
    try {
      const authedReq = req as AuthedRequest;
      const boards = await listWhiteboards(authedReq.byDept!, authedReq.session!);
      res.json(boards);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list whiteboards' });
    }
  });

  router.post('/whiteboards', requireCreatePermission, async (req, res) => {
    try {
      const doc = await createWhiteboard((req as AuthedRequest).byDept!);
      res.status(201).json(doc);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create whiteboard' });
    }
  });

  router.put('/whiteboards/order', requireCreatePermission, async (req, res) => {
    try {
      const { ids } = req.body as { ids?: unknown };
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        res.status(400).json({ error: 'ids array required' });
        return;
      }
      const boards = await reorderWhiteboards(
        (req as AuthedRequest).byDept!,
        ids,
        (req as AuthedRequest).session!,
      );
      res.json(boards);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to reorder whiteboards' });
    }
  });

  router.get('/whiteboards/:id', async (req, res) => {
    try {
      const authedReq = req as AuthedRequest;
      const doc = await getWhiteboard(authedReq.byDept!, req.params.id);
      if (!doc) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (!canAccessWhiteboardDoc(authedReq.session!, authedReq.byDept!, doc, getShareTokenFromRequest(req))) {
        res.status(403).json({ error: '열람 권한이 없습니다' });
        return;
      }
      res.json(doc);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to get whiteboard' });
    }
  });

  router.put('/whiteboards/:id', async (req, res) => {
    try {
      const authedReq = req as AuthedRequest;
      const existing = await getWhiteboard(authedReq.byDept!, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (!canAccessWhiteboardDoc(authedReq.session!, authedReq.byDept!, existing, getShareTokenFromRequest(req))) {
        res.status(403).json({ error: '편집 권한이 없습니다' });
        return;
      }
      const doc = await saveWhiteboard(authedReq.byDept!, req.params.id, req.body);
      if (!doc) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(doc);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save whiteboard' });
    }
  });

  router.patch('/whiteboards/:id/visibility', requireCreatePermission, async (req, res) => {
    try {
      const { isPrivate, isViewRestricted } = req.body as {
        isPrivate?: unknown;
        isViewRestricted?: unknown;
      };
      if (typeof isPrivate !== 'boolean') {
        res.status(400).json({ error: 'isPrivate boolean required' });
        return;
      }
      const doc = await updateWhiteboardVisibility(
        (req as AuthedRequest).byDept!,
        req.params.id as string,
        {
          isPrivate,
          isViewRestricted: typeof isViewRestricted === 'boolean' ? isViewRestricted : false,
        },
      );
      if (!doc) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({
        id: doc.id,
        title: doc.title,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        thumbnail: doc.thumbnail,
        shareToken: doc.shareToken,
        isPrivate: doc.isPrivate,
        isViewRestricted: doc.isViewRestricted,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update visibility' });
    }
  });

  router.patch('/whiteboards/:id', async (req, res) => {
    try {
      const { title } = req.body as { title?: string };
      if (!title) {
        res.status(400).json({ error: 'Title required' });
        return;
      }
      const doc = await renameWhiteboard((req as AuthedRequest).byDept!, req.params.id, title);
      if (!doc) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(doc);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to rename whiteboard' });
    }
  });

  router.post('/whiteboards/:id/copy', requireCreatePermission, async (req, res) => {
    try {
      const doc = await copyWhiteboard((req as AuthedRequest).byDept!, req.params.id as string);
      if (!doc) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(201).json(doc);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to copy whiteboard' });
    }
  });

  router.post('/whiteboards/:id/share-link', requireCreatePermission, async (req, res) => {
    try {
      const result = await createShareLink((req as AuthedRequest).byDept!, req.params.id as string);
      if (!result) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create share link' });
    }
  });

  router.delete('/whiteboards/:id/share-link', requireCreatePermission, async (req, res) => {
    try {
      const ok = await revokeShareLink((req as AuthedRequest).byDept!, req.params.id as string);
      if (!ok) {
        res.status(404).json({ error: '공유 링크가 없습니다' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to revoke share link' });
    }
  });

  router.delete('/whiteboards/:id', requireCreatePermission, async (req, res) => {
    try {
      const ok = await deleteWhiteboard((req as AuthedRequest).byDept!, req.params.id as string);
      if (!ok) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete whiteboard' });
    }
  });

  router.get('/settings', requireSuper, async (_req, res) => {
    try {
      const settings = await getPublicSettings();
      res.json(settings);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '설정을 불러오지 못했습니다' });
    }
  });

  router.put('/settings', requireSuper, async (req, res) => {
    try {
      const body = req.body as {
        allowedIpCidrs?: unknown;
        themeAccentColor?: string | null;
        dataRoot?: string | null;
        webServerPort?: number | null;
        webServerMode?: WebServerMode | null;
      };

      if (body.dataRoot !== undefined) {
        res.status(403).json({
          error:
            '데이터 디렉터리는 Electron 앱의 환경설정에서만 변경할 수 있습니다.',
        });
        return;
      }

      const patch: Parameters<typeof updateSettings>[0] = {};
      if (body.allowedIpCidrs !== undefined) {
        patch.allowedIpCidrs = normalizeAllowedIpCidrs(body.allowedIpCidrs);
      }
      if (body.themeAccentColor !== undefined) {
        patch.themeAccentColor = body.themeAccentColor ?? undefined;
      }
      if (body.webServerPort !== undefined) {
        const port = body.webServerPort == null ? undefined : normalizeWebServerPort(body.webServerPort);
        if (body.webServerPort != null && port == null) {
          res.status(400).json({ error: '포트는 1~65535 사이 숫자여야 합니다.' });
          return;
        }
        patch.webServerPort = port ?? undefined;
      }
      if (body.webServerMode !== undefined) {
        const mode =
          body.webServerMode == null ? undefined : normalizeWebServerMode(body.webServerMode);
        if (body.webServerMode != null && !mode) {
          res.status(400).json({ error: '서버 모드가 올바르지 않습니다.' });
          return;
        }
        patch.webServerMode = mode ?? undefined;
      }

      await updateSettings(patch);
      res.json(await getPublicSettings());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '설정을 저장하지 못했습니다' });
    }
  });

  router.get('/server/info', requireSuper, async (_req, res) => {
    try {
      const { getServerInfo } = await serverRuntime();
      const info = await getServerInfo();
      res.json(info);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '서버 정보를 불러오지 못했습니다' });
    }
  });

  router.put('/server/config', requireSuper, requireLocalServerControl, async (req, res) => {
    try {
      const body = req.body as { port?: unknown; mode?: unknown };
      const port =
        body.port === undefined ? undefined : normalizeWebServerPort(body.port) ?? undefined;
      if (body.port !== undefined && port == null) {
        res.status(400).json({ error: '포트는 1~65535 사이 숫자여야 합니다.' });
        return;
      }
      const mode =
        body.mode === undefined ? undefined : normalizeWebServerMode(body.mode) ?? undefined;
      if (body.mode !== undefined && !mode) {
        res.status(400).json({ error: '서버 모드가 올바르지 않습니다.' });
        return;
      }

      const { applyListenConfig } = await serverRuntime();
      const result = await applyListenConfig({ port, mode });
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : '서버 설정을 적용하지 못했습니다',
      });
    }
  });

  router.post('/server/firewall/allow', requireSuper, requireLocalServerControl, async (req, res) => {
    try {
      const port = normalizeWebServerPort((req.body as { port?: unknown })?.port);
      const result = await allowFirewallInbound(port);
      res.status(result.ok ? 200 : 500).json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '방화벽 규칙을 추가하지 못했습니다' });
    }
  });

  router.post('/server/firewall/remove', requireSuper, requireLocalServerControl, async (req, res) => {
    try {
      const port = normalizeWebServerPort((req.body as { port?: unknown })?.port);
      const result = await removeFirewallInbound(port);
      res.status(result.ok ? 200 : 500).json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '방화벽 규칙을 제거하지 못했습니다' });
    }
  });

  router.get('/members', requireSuper, async (_req, res) => {
    try {
      const members = await listMembers();
      res.json({ members });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '회원 목록을 불러오지 못했습니다' });
    }
  });

  router.put('/members', requireSuper, async (req, res) => {
    try {
      const body = req.body as { members?: unknown };
      if (!Array.isArray(body.members)) {
        res.status(400).json({ error: 'members 배열이 필요합니다' });
        return;
      }

      const inputs: MemberUpsertInput[] = [];
      for (const raw of body.members) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        if (item.delete && typeof item.id === 'string') {
          inputs.push({
            id: item.id,
            username: String(item.username ?? ''),
            role: normalizeMemberRole(item.role) ?? 'user',
            delete: true,
          });
          continue;
        }

        const username = typeof item.username === 'string' ? item.username.trim() : '';
        const role = normalizeMemberRole(item.role);
        if (!username || !role) {
          res.status(400).json({ error: '회원 아이디와 역할이 필요합니다' });
          return;
        }

        inputs.push({
          id: typeof item.id === 'string' ? item.id : undefined,
          username,
          role,
          password: typeof item.password === 'string' ? item.password : undefined,
          adminDept: typeof item.adminDept === 'string' ? item.adminDept : undefined,
          disabled: Boolean(item.disabled),
          displayName: typeof item.displayName === 'string' ? item.displayName : undefined,
        });
      }

      const members = await saveMembersList(inputs);
      res.json({ members });
    } catch (err) {
      console.error(err);
      res.status(400).json({
        error: err instanceof Error ? err.message : '회원 정보를 저장하지 못했습니다',
      });
    }
  });

  return router;
}
