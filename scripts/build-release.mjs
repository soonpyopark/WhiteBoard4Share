#!/usr/bin/env node
/**
 * Build MSI + portable zip from one Electron unpack, one build stamp.
 *
 * Output (same YYMMDD_HHMMSS):
 *   msi/Whiteboard4Share v{version}_{stamp}.msi
 *   msi/Whiteboard4Share v{version}_{stamp}_portable.zip
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import {
  RELEASE_STAGING_DIR,
  formatBuildStamp,
  projectRoot,
  writeAppBuildStamp,
} from './stamp-build.mjs';

function log(msg) {
  console.log(`[release] ${msg}`);
}

function run(cmd, options = {}) {
  log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot, shell: true, ...options });
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('build:release must run on Windows.');
  }

  const stamp = formatBuildStamp();
  log(`build stamp: ${stamp}`);
  writeAppBuildStamp(stamp);

  run('npm run prepare:icon');
  fs.rmSync(RELEASE_STAGING_DIR, { recursive: true, force: true });
  run('npm run build');
  run('node scripts/build-electron.mjs');

  const builderCmd = [
    'npx electron-builder',
    '--win dir',
    `--config.directories.output="${RELEASE_STAGING_DIR}"`,
  ].join(' ');
  run(builderCmd);

  const env = {
    ...process.env,
    WB4S_BUILD_STAMP: stamp,
    WB4S_SKIP_STAMP: '1',
    WB4S_SKIP_PUBLISH: '1',
    WB4S_RELEASE_PORTABLE: '1',
  };

  run('node scripts/build-msi.mjs', { env });
  run('node scripts/build-dist-exe.mjs', { env });

  const fileStamp = stamp.replace('-', '_');
  log(`done — MSI + portable share stamp ${stamp}`);
  log(`artifacts under msi/ (see Whiteboard4Share v*_${fileStamp}*)`);
}

try {
  main();
} catch (error) {
  console.error('[release] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
