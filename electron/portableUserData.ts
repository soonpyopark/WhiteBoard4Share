import { app } from 'electron';
import path from 'path';

/** Chromium / Electron profile next to the exe (or project root in dev). */
export const ELECTRON_PROFILE_DIR = path.join('.wb4s', 'electron-profile');

/** Default Electron `userData` name under %APPDATA% (package.json `name`). */
export const LEGACY_USER_DATA_NAME = 'whiteboard4share';

/**
 * Redirect Electron/Chromium `userData` so portable/MSI installs do not write
 * %APPDATA%\whiteboard4share. Must run before `requestSingleInstanceLock()`.
 */
export function applyPortableUserData(): string {
  const exeRoot = app.isPackaged ? path.dirname(process.execPath) : process.cwd();
  const userData = path.join(exeRoot, ELECTRON_PROFILE_DIR);
  app.setPath('userData', userData);
  return userData;
}

/** Previous Electron default: `%APPDATA%\whiteboard4share`. */
export function getLegacyUserDataPath(): string {
  try {
    return path.join(app.getPath('appData'), LEGACY_USER_DATA_NAME);
  } catch {
    return '';
  }
}
