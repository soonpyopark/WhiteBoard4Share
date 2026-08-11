import { APP_CONFIG } from '../appConfig';
import {
  RELEASES_LATEST_API,
  RELEASES_PAGE_URL,
  isUpdateAvailable,
  maxBuildStamp,
  parseReleaseTag,
  resolveUpdateKind,
  versionLabel,
  type UpdateCheckResult,
} from '../../shared/updateCheck';

export type UpdateDialogApi = {
  alert: (message: string, options?: { title?: string; confirmLabel?: string }) => Promise<void>;
  confirm: (
    message: string,
    options?: { title?: string; confirmLabel?: string; cancelLabel?: string },
  ) => Promise<boolean>;
};

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Fetch latest GitHub release and compare with the running app version. */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const current = APP_CONFIG.version;
  try {
    const response = await fetch(RELEASES_LATEST_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Whiteboard4Share/${current}`,
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        current,
        error: `GitHub 응답 오류 (HTTP ${response.status})`,
      };
    }
    const payload = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      updated_at?: string;
      published_at?: string;
      assets?: Array<{ name?: string }>;
    };
    const latest = parseReleaseTag(String(payload.tag_name || ''));
    if (!latest) {
      return {
        ok: false,
        current,
        error: `릴리스 버전을 해석할 수 없습니다: ${payload.tag_name || '(없음)'}`,
      };
    }
    const assetNames = Array.isArray(payload.assets)
      ? payload.assets.map((item) => String(item?.name || ''))
      : [];
    return {
      ok: true,
      current,
      latest,
      latestBuildStamp: maxBuildStamp(assetNames),
      releaseUpdatedAt: String(payload.updated_at || payload.published_at || '').trim() || null,
      releaseUrl: String(payload.html_url || '').trim() || RELEASES_PAGE_URL,
    };
  } catch (error) {
    return {
      ok: false,
      current,
      error: error instanceof Error ? error.message || '네트워크 오류' : '네트워크 오류',
    };
  }
}

export async function presentUpdateCheckResult(
  result: UpdateCheckResult,
  dialog: UpdateDialogApi,
): Promise<void> {
  const title = '업데이트 확인';
  const current = versionLabel(result.current);
  const currentHint = result.currentBuildStamp
    ? `${current} (${result.currentBuildStamp})`
    : current;

  if (!result.ok) {
    const open = await dialog.confirm(
      `업데이트 정보를 확인할 수 없습니다.\n\n${result.error || '알 수 없는 오류'}\n\n현재 버전: ${current}`,
      {
        title,
        confirmLabel: '릴리스 페이지 열기',
        cancelLabel: '닫기',
      },
    );
    if (open) openExternal(RELEASES_PAGE_URL);
    return;
  }

  if (isUpdateAvailable(result)) {
    const kind = resolveUpdateKind(result);
    const latest = versionLabel(result.latest || '');
    const stampHint =
      kind === 'build' && result.latestBuildStamp ? `\n최신 빌드: ${result.latestBuildStamp}` : '';
    const message =
      kind === 'build'
        ? `같은 버전의 새 빌드가 있습니다: ${latest}\n\n현재 버전: ${currentHint}${stampHint}`
        : `새 버전이 있습니다: ${latest}\n\n현재 버전: ${currentHint}`;
    const open = await dialog.confirm(message, {
      title,
      confirmLabel: '다운로드',
      cancelLabel: '나중에',
    });
    if (open) openExternal(result.releaseUrl || RELEASES_PAGE_URL);
    return;
  }

  await dialog.alert(`최신 버전입니다.\n\n현재 버전: ${currentHint}`, { title });
}

export async function runUpdateCheck(dialog: UpdateDialogApi): Promise<void> {
  const result = await checkForUpdates();
  await presentUpdateCheckResult(result, dialog);
}

export { RELEASES_PAGE_URL };
