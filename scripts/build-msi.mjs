#!/usr/bin/env node
/**
 * Build a per-user Windows MSI for Whiteboard4Share (Electron).
 * Requires WiX CLI 7+ (winget install WiXToolset.WiXCLI) and: wix eula accept wix7
 *
 * Flow:
 * 1) stamp buildStamp unless WB4S_SKIP_STAMP
 * 2) build renderer + package Electron as unpacked dir (unless WB4S_SKIP_PUBLISH)
 * 3) stage → msi/Whiteboard4Share/ then wix build → msi/Whiteboard4Share v{version}_{stamp}.msi
 *
 * Env (used by build:release):
 *   WB4S_BUILD_STAMP=YYMMDD-HHMMSS
 *   WB4S_SKIP_STAMP=1
 *   WB4S_SKIP_PUBLISH=1  — reuse .dist-build/release unpack
 */

import { execFileSync, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  RELEASE_STAGING_DIR,
  projectRoot,
  resolveReleaseBuildStamp,
  shouldSkipPublish,
  shouldSkipStamp,
  toFileStamp,
  writeAppBuildStamp,
} from './stamp-build.mjs';

const APP_NAME = 'Whiteboard4Share';
const SITE_URL = 'https://note4all.tistory.com';
const MSI_DIR = path.join(projectRoot, 'msi');
const STAGE_DIR = path.join(MSI_DIR, APP_NAME);
const PRODUCT_WXS = path.join(MSI_DIR, 'Product.wxs');
const LICENSE_RTF = path.join(MSI_DIR, 'License.rtf');
const STAGING_DIR = path.join(projectRoot, '.dist-build', 'win-msi');
let wixCmd = 'wix';
/** @type {string} */
let buildStamp = '';

function log(msg) {
  console.log(`[msi] ${msg}`);
}

function run(cmd, options = {}) {
  log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot, shell: true, ...options });
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  return pkg.version ?? '1.0.0';
}

function toMsiVersion(version, stampDate = new Date()) {
  const parts = String(version).split('.').map((p) => Number.parseInt(p, 10) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }
  const revision = Math.floor(stampDate.getTime() / 60_000) % 65535;
  return `${parts[0]}.${parts[1]}.${parts[2]}.${revision || 1}`;
}

function resolveWixCmd() {
  try {
    execSync('wix --version', { stdio: 'pipe' });
    return 'wix';
  } catch {
    /* look under Program Files */
  }

  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const candidates = [
    path.join(programFiles, 'WiX Toolset v7.0', 'bin', 'wix.exe'),
    path.join(programFiles, 'WiX Toolset v6.0', 'bin', 'wix.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'WiX CLI not found. Install: winget install WiXToolset.WiXCLI\nThen run: wix eula accept wix7',
  );
}

function ensureWix() {
  wixCmd = resolveWixCmd();
  execFileSync(wixCmd, ['--version'], { stdio: 'pipe' });
}

function findUnpackedDir(outputDir) {
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Publish output not found: ${outputDir}`);
  }
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  const matches = entries.filter((entry) => entry.isDirectory() && /^win-/.test(entry.name));
  if (matches.length !== 1) {
    throw new Error(
      `빌드 출력 폴더를 찾을 수 없습니다 (${outputDir}). 발견: ${matches.map((e) => e.name).join(', ') || '없음'}`,
    );
  }
  return path.join(outputDir, matches[0].name);
}

function findMainExe(dir) {
  const entries = fs.readdirSync(dir);
  const preferred = entries.find((name) => name === `${APP_NAME}.exe`);
  if (preferred) return preferred;
  const fallback = entries.find(
    (name) => name.toLowerCase().endsWith('.exe') && !name.toLowerCase().includes('uninstall'),
  );
  if (!fallback) {
    throw new Error(`Main executable not found in ${dir}`);
  }
  return fallback;
}

function packageUnpackedBuild() {
  if (shouldSkipPublish()) {
    log(`reusing publish output → ${RELEASE_STAGING_DIR}`);
    return findUnpackedDir(RELEASE_STAGING_DIR);
  }

  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  run('npm run prepare:icon');
  run('npm run build');
  run('node scripts/build-electron.mjs');
  run(
    [
      'npx electron-builder',
      '--win dir',
      `--config.directories.output="${STAGING_DIR}"`,
    ].join(' '),
  );
  return findUnpackedDir(STAGING_DIR);
}

function stageForMsi(winUnpackedDir) {
  if (!fs.existsSync(PRODUCT_WXS)) {
    throw new Error(`Missing ${PRODUCT_WXS}`);
  }
  if (!fs.existsSync(LICENSE_RTF)) {
    throw new Error(`Missing ${LICENSE_RTF}`);
  }

  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(STAGE_DIR), { recursive: true });
  fs.cpSync(winUnpackedDir, STAGE_DIR, { recursive: true });

  const mainExe = findMainExe(STAGE_DIR);
  log(`main executable: ${mainExe}`);

  const icoPath = path.join(projectRoot, 'electron', 'icon.ico');
  if (!fs.existsSync(icoPath)) {
    throw new Error('electron/icon.ico not found — run npm run prepare:icon first');
  }
  fs.copyFileSync(icoPath, path.join(STAGE_DIR, 'app-icon.ico'));

  for (const name of ['allow-firewall-inbound.bat', '.env.example', 'LICENSE']) {
    const src = path.join(projectRoot, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(STAGE_DIR, name));
    }
  }

  for (const name of ['data', '.wb4s', '.env', '.cache']) {
    fs.rmSync(path.join(STAGE_DIR, name), { recursive: true, force: true });
  }

  log(`staged: ${STAGE_DIR}`);
  return mainExe;
}

function buildMsi() {
  const version = readVersion();
  const productVersion = toMsiVersion(version);
  const productCode = randomUUID().toUpperCase();
  const fileStamp = toFileStamp(buildStamp);
  const outputName = `${APP_NAME} v${version}_${fileStamp}.msi`;
  const outputPath = path.join(MSI_DIR, outputName);

  fs.mkdirSync(MSI_DIR, { recursive: true });
  fs.rmSync(outputPath, { force: true });

  const wixArgs = [
    'build',
    PRODUCT_WXS,
    '-d',
    `ProductVersion=${productVersion}`,
    '-d',
    `ProductCode=${productCode}`,
    '-bindpath',
    MSI_DIR,
    '-ext',
    'WixToolset.UI.wixext',
    '-ext',
    'WixToolset.Util.wixext',
    '-o',
    outputPath,
  ];
  log(`> ${wixCmd} ${wixArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
  execFileSync(wixCmd, wixArgs, { stdio: 'inherit', cwd: projectRoot });

  const sizeMb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
  log(`output: ${outputPath} (${sizeMb} MB)`);
  log(`ProductVersion=${productVersion} ProductCode={${productCode}}`);
  log(`build stamp: ${fileStamp}`);
  log(`site: ${SITE_URL}`);
  return outputPath;
}

function cleanupStage() {
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  if (!shouldSkipPublish()) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  log('removed staging folders');
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('MSI build must run on Windows.');
  }

  buildStamp = resolveReleaseBuildStamp();
  if (!shouldSkipStamp()) {
    log(`stamping buildStamp=${buildStamp}`);
    writeAppBuildStamp(buildStamp);
  } else {
    log(`reusing buildStamp=${buildStamp} (WB4S_SKIP_STAMP)`);
  }

  ensureWix();
  const winUnpackedDir = packageUnpackedBuild();
  stageForMsi(winUnpackedDir);

  try {
    buildMsi();
  } finally {
    cleanupStage();
  }

  log('설치: msi 폴더의 .msi 파일을 더블 클릭하세요 (관리자 권한 불필요).');
  log('done');
}

try {
  main();
} catch (error) {
  console.error('[msi] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
