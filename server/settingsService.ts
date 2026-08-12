import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeAllowedIpCidrs, type AllowedIpEntry } from '../shared/ipCidrCore.ts';
import {
  normalizeWebServerMode,
  normalizeWebServerPort,
  type WebServerMode,
} from '../shared/webServerConfig.ts';
import { getAppRoot, getDataDir, getDefaultDataDir } from './paths.ts';
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from '../shared/theme.ts';

export type AppSettings = {
  dataRoot?: string;
  webServerPort?: number;
  webServerMode?: WebServerMode;
  allowedIpCidrs: AllowedIpEntry[];
  themeAccentColor?: string;
};

export type DataRootState = {
  configured: string | null;
  effective: string;
  defaultDataRoot: string;
  canEdit: boolean;
};

const SETTINGS_FILE = '.wb4s-settings.json';
const DEFAULT_ACCENT = DEFAULT_ACCENT_COLOR;

/**
 * Settings always live under the app's default `data/` folder
 * (`{appRoot}/data/.wb4s-settings.json`), not a custom dataRoot.
 * That way `dataRoot` can be read before WHITE_BOARD_DATA_DIR is applied.
 */
function settingsPath(): string {
  return path.join(getDefaultDataDir(), SETTINGS_FILE);
}

function legacyAppRootSettingsPath(): string {
  return path.join(getAppRoot(), SETTINGS_FILE);
}

function normalizeStoredAccent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = normalizeAccentColor(trimmed, '');
  return normalized || undefined;
}

export function normalizeAppSettings(raw: unknown): AppSettings {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const port = normalizeWebServerPort(record.webServerPort);
  const mode = normalizeWebServerMode(record.webServerMode);
  const dataRoot =
    typeof record.dataRoot === 'string' && record.dataRoot.trim()
      ? path.normalize(record.dataRoot.trim())
      : undefined;
  const themeAccentColor = normalizeStoredAccent(record.themeAccentColor);

  return {
    ...(dataRoot ? { dataRoot } : {}),
    ...(port != null ? { webServerPort: port } : {}),
    ...(mode ? { webServerMode: mode } : {}),
    allowedIpCidrs: normalizeAllowedIpCidrs(record.allowedIpCidrs),
    ...(themeAccentColor ? { themeAccentColor } : {}),
  };
}

export function defaultAppSettings(): AppSettings {
  return { allowedIpCidrs: [] };
}

async function readSettingsFile(filePath: string): Promise<AppSettings | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return normalizeAppSettings(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const primary = await readSettingsFile(settingsPath());
  if (primary) return primary;

  // Migrate from older location at app root
  const legacy = await readSettingsFile(legacyAppRootSettingsPath());
  if (legacy) {
    await saveSettings(legacy);
    try {
      await fs.unlink(legacyAppRootSettingsPath());
    } catch {
      /* ignore */
    }
    return legacy;
  }

  return defaultAppSettings();
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = normalizeAppSettings(settings);
  await fs.mkdir(getDefaultDataDir(), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export type SettingsPatch = Partial<Omit<AppSettings, 'dataRoot'>> & {
  dataRoot?: string | null;
  allowedIpCidrs?: AllowedIpEntry[];
};

export async function updateSettings(patch: SettingsPatch): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = {
    ...current,
    allowedIpCidrs:
      patch.allowedIpCidrs !== undefined
        ? normalizeAllowedIpCidrs(patch.allowedIpCidrs)
        : current.allowedIpCidrs,
  };

  if (patch.webServerPort !== undefined) {
    if (patch.webServerPort == null) delete next.webServerPort;
    else next.webServerPort = patch.webServerPort;
  }

  if (patch.webServerMode !== undefined) {
    if (patch.webServerMode == null) delete next.webServerMode;
    else next.webServerMode = patch.webServerMode;
  }

  if (patch.themeAccentColor === null || patch.themeAccentColor === '') {
    delete next.themeAccentColor;
  } else if (patch.themeAccentColor !== undefined) {
    const accent = normalizeStoredAccent(patch.themeAccentColor);
    if (accent) next.themeAccentColor = accent;
    else delete next.themeAccentColor;
  }

  if (patch.dataRoot === null || patch.dataRoot === '') {
    delete next.dataRoot;
  } else if (typeof patch.dataRoot === 'string' && patch.dataRoot.trim()) {
    next.dataRoot = path.normalize(patch.dataRoot.trim());
  }

  return saveSettings(next);
}

export function getDefaultAccentColor(): string {
  return DEFAULT_ACCENT;
}

export async function getThemeAccentColor(): Promise<string> {
  const settings = await loadSettings();
  return settings.themeAccentColor ?? DEFAULT_ACCENT;
}

/** Apply settings/`WHITE_BOARD_DATA_DIR` to the process env before the server starts. */
export async function applyConfiguredDataDirToEnv(): Promise<string> {
  const settings = await loadSettings();
  const configured = settings.dataRoot?.trim();
  const dir = configured
    ? path.normalize(configured)
    : process.env.WHITE_BOARD_DATA_DIR?.trim() || getDefaultDataDir();
  process.env.WHITE_BOARD_DATA_DIR = dir;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function isElectronHostProcess(): boolean {
  return Boolean(process.versions.electron || process.env.ELECTRON_APP_ROOT);
}

export async function getDataRootState(): Promise<DataRootState> {
  const settings = await loadSettings();
  const defaultDataRoot = getDefaultDataDir();
  const configured = settings.dataRoot?.trim() ? path.normalize(settings.dataRoot.trim()) : null;
  return {
    configured,
    effective: getDataDir(),
    defaultDataRoot,
    canEdit: isElectronHostProcess(),
  };
}

export async function getPublicSettings(): Promise<
  AppSettings & {
    dataDir: string;
    defaultAccentColor: string;
    dataRootState: DataRootState;
  }
> {
  const settings = await loadSettings();
  return {
    ...settings,
    dataDir: getDataDir(),
    defaultAccentColor: DEFAULT_ACCENT,
    themeAccentColor: settings.themeAccentColor ?? DEFAULT_ACCENT,
    dataRootState: await getDataRootState(),
  };
}
