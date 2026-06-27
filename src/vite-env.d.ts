/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOME_URL?: string;
  readonly VITE_SIGNALING_PATH?: string;
  readonly VITE_USE_PUBLIC_SIGNALING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
