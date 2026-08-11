import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function getAppRoot(): string {
  return process.env.ELECTRON_APP_ROOT ?? path.join(moduleDir, '..');
}

/** Default data folder next to the app (`{appRoot}/data`). */
export function getDefaultDataDir(): string {
  return path.join(getAppRoot(), 'data');
}

export function getDataDir(): string {
  return process.env.WHITE_BOARD_DATA_DIR ?? getDefaultDataDir();
}

export function getDistDir(): string {
  if (process.env.ELECTRON_DIST_DIR) {
    return process.env.ELECTRON_DIST_DIR;
  }
  return path.join(getAppRoot(), 'dist');
}
