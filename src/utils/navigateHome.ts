/** .env의 VITE_HOME_URL (미설정·주석 시 undefined) */
export function getBuildTimeHomeUrl(): string | undefined {
  const url = import.meta.env.VITE_HOME_URL?.trim();
  return url || undefined;
}

export interface NavigateHomeOptions {
  runtimeHomeUrl?: string | null;
  homeTarget?: 'self' | 'blank';
  onAppHome?: () => void;
}

/** 홈 URL이 있으면 이동, 없으면 앱 첫 화면 콜백 실행 */
export function navigateHome(options?: NavigateHomeOptions | (() => void)): void {
  const resolved: NavigateHomeOptions =
    typeof options === 'function' ? { onAppHome: options } : (options ?? {});

  const url = resolved.runtimeHomeUrl?.trim() || getBuildTimeHomeUrl();
  if (url) {
    if (resolved.homeTarget === 'blank') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
    return;
  }
  resolved.onAppHome?.();
}
