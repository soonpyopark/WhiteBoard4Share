/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOME_URL?: string;
  readonly VITE_SIGNALING_PATH?: string;
  readonly VITE_USE_PUBLIC_SIGNALING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type Wb4sAutoLaunchState = {
  supported: boolean;
  enabled: boolean;
  startHidden: boolean;
  execPath: string;
  reason: string;
};

type Wb4sDesktopApi = {
  isElectron: true;
  getPaths: () => Promise<{
    appRoot: string;
    defaultDataRoot: string;
    dataRoot: string;
    configuredDataRoot: string | null;
  }>;
  pickDirectory: (options?: { title?: string }) => Promise<string | null>;
  applyDataRoot: (
    nextPath: string | null,
  ) => Promise<{
    ok: boolean;
    willRelaunch: boolean;
    configured: string | null;
    effective: string;
    defaultDataRoot: string;
  }>;
  relaunch: () => Promise<{ ok: boolean; willRelaunch: boolean }>;
  getAutoLaunch: () => Promise<Wb4sAutoLaunchState>;
  setAutoLaunch: (options: {
    enabled?: boolean;
    startHidden?: boolean;
  }) => Promise<Wb4sAutoLaunchState>;
};

interface Window {
  wb4s?: Wb4sDesktopApi;
}
