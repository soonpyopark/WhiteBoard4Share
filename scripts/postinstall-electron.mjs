import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = path.join(rootDir, 'node_modules', 'electron');
const electronExe = path.join(electronDir, 'dist', 'electron.exe');

if (!fs.existsSync(electronDir)) {
  process.exit(0);
}

if (fs.existsSync(electronExe)) {
  process.exit(0);
}

console.log('[postinstall] Downloading Electron binary...');
const result = spawnSync(process.execPath, ['install.js'], {
  cwd: electronDir,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '' },
});

if (result.status !== 0 || !fs.existsSync(electronExe)) {
  console.warn('[postinstall] Electron install.js did not produce electron.exe.');
  console.warn('  Run: node node_modules/electron/install.js');
  process.exit(0);
}
