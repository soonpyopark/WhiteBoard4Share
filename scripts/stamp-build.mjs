import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = projectRoot;
const APP_CONFIG_PATH = path.join(root, 'src', 'appConfig.ts');

/** Shared Electron unpack output used by `build:release` (MSI + portable). */
export const RELEASE_STAGING_DIR = path.join(root, '.dist-build', 'release');

export function shouldSkipStamp() {
  return process.env.WB4S_SKIP_STAMP === '1';
}

export function shouldSkipPublish() {
  return process.env.WB4S_SKIP_PUBLISH === '1';
}

export function shouldReleasePortable() {
  return process.env.WB4S_RELEASE_PORTABLE === '1';
}

/** MSI / zip filenames use YYMMDD_HHMMSS (underscore), matching sibling apps. */
export function toFileStamp(stamp) {
  return normalizeBuildStamp(stamp).replace('-', '_');
}

export function formatBuildStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(2);
  return `${yy}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function isBuildStamp(value) {
  return /^\d{6}[-_]\d{6}$/.test(String(value || '').trim());
}

/** Folder / in-app stamp uses YYMMDD-HHMMSS (hyphen). */
export function normalizeBuildStamp(value) {
  const raw = String(value || '').trim();
  if (!isBuildStamp(raw)) return '';
  return raw.replace('_', '-');
}

export function readAppBuildStamp() {
  if (!fs.existsSync(APP_CONFIG_PATH)) return '';
  const text = fs.readFileSync(APP_CONFIG_PATH, 'utf8');
  const match = text.match(/buildStamp:\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? '';
}

export function writeAppBuildStamp(stamp) {
  const normalized = normalizeBuildStamp(stamp);
  if (!normalized) throw new Error(`Invalid build stamp: ${stamp}`);

  let text = fs.readFileSync(APP_CONFIG_PATH, 'utf8');
  if (/buildStamp:\s*['"][^'"]*['"]/.test(text)) {
    text = text.replace(/buildStamp:\s*['"][^'"]*['"]/, `buildStamp: '${normalized}'`);
  } else {
    text = text.replace(
      /(version:\s*['"][^'"]+['"],)/,
      `$1\n  /** YYMMDD-HHMMSS — 릴리스 파일명과 동일. \`build:release\` / \`build:dist:exe\` 시 갱신 */\n  buildStamp: '${normalized}',`,
    );
  }
  fs.writeFileSync(APP_CONFIG_PATH, text, 'utf8');
  return normalized;
}

export function resolveReleaseBuildStamp() {
  const envStamp = normalizeBuildStamp(process.env.WB4S_BUILD_STAMP);
  if (envStamp) return envStamp;
  if (process.env.WB4S_SKIP_STAMP === '1') {
    return normalizeBuildStamp(readAppBuildStamp()) || formatBuildStamp();
  }
  return formatBuildStamp();
}
