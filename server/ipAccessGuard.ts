import type { NextFunction, Request, Response } from 'express';
import { getClientIpFromRequest, ipBlockedHtml, isIpAllowed } from './ipAllowlist.ts';
import { loadSettings } from './settingsService.ts';

export async function ipAccessGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await loadSettings();
    const clientIp = getClientIpFromRequest(req);
    if (isIpAllowed(clientIp, settings.allowedIpCidrs)) {
      next();
      return;
    }

    const acceptsHtml = String(req.headers.accept ?? '').includes('text/html');
    if (acceptsHtml || !req.path.startsWith('/api')) {
      res.status(403).type('html').send(ipBlockedHtml());
      return;
    }
    res.status(403).json({ error: '접속이 허용되지 않은 IP입니다' });
  } catch (error) {
    console.error('[ip-guard]', error);
    next();
  }
}
