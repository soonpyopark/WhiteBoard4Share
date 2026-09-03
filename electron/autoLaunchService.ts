import { app } from 'electron';

/**
 * Passed to the login-item entry so a boot-time launch can go straight to the
 * tray instead of popping the window open on every sign-in.
 */
export const START_HIDDEN_ARG = '--hidden';

export type AutoLaunchState = {
  supported: boolean;
  enabled: boolean;
  startHidden: boolean;
  execPath: string;
  reason: string;
};

/** Empty string means auto launch can be configured here. */
export function autoLaunchSupportReason(): string {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return '자동 실행은 Windows와 macOS에서만 설정할 수 있습니다.';
  }
  if (!app.isPackaged) {
    return '개발 모드에서는 자동 실행을 등록할 수 없습니다. 설치·포터블 실행 파일에서 사용하세요.';
  }
  return '';
}

export function getAutoLaunchState(): AutoLaunchState {
  const reason = autoLaunchSupportReason();
  if (reason) {
    return {
      supported: false,
      enabled: false,
      startHidden: false,
      execPath: process.execPath,
      reason,
    };
  }

  if (process.platform === 'darwin') {
    const settings = app.getLoginItemSettings();
    return {
      supported: true,
      enabled: Boolean(settings.openAtLogin),
      // Electron 44 removed openAsHidden (macOS 12-only). Hidden start is Windows `--hidden`.
      startHidden: false,
      execPath: process.execPath,
      reason: '',
    };
  }

  // Windows matches the registry value against `path` + `args`, so probe both variants.
  const hidden = app.getLoginItemSettings({
    path: process.execPath,
    args: [START_HIDDEN_ARG],
  });
  if (hidden.openAtLogin) {
    return {
      supported: true,
      enabled: true,
      startHidden: true,
      execPath: process.execPath,
      reason: '',
    };
  }

  const visible = app.getLoginItemSettings({ path: process.execPath, args: [] });
  return {
    supported: true,
    enabled: Boolean(visible.openAtLogin),
    startHidden: false,
    execPath: process.execPath,
    reason: '',
  };
}

/**
 * Always rewrites the entry with the current executable path, so re-enabling
 * repairs a stale path (e.g. the portable drive got a new letter).
 */
export function setAutoLaunch(enabled: boolean, startHidden = false): AutoLaunchState {
  const reason = autoLaunchSupportReason();
  if (reason) throw new Error(reason);

  const hidden = Boolean(enabled && startHidden);

  // Clear the other variant first; Windows keys them by value, not by args.
  app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, args: [] });
  app.setLoginItemSettings({
    openAtLogin: false,
    path: process.execPath,
    args: [START_HIDDEN_ARG],
  });

  if (enabled) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: hidden ? [START_HIDDEN_ARG] : [],
    });
  }

  return getAutoLaunchState();
}
