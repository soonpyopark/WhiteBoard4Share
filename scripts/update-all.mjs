#!/usr/bin/env node
/**
 * Update npm dependencies and pin Electron to npm `latest`.
 * Other packages stay within package.json semver ranges (`npm update`).
 *
 * Options:
 *   --skip-git
 *   --skip-npm
 *   --build / --release   run npm run build:release (MSI + portable zip)
 *   --force               npm install --force; re-download Electron binary
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function parseArgs(argv) {
  return {
    skipGit: argv.includes('--skip-git'),
    skipNpm: argv.includes('--skip-npm'),
    build: argv.includes('--build') || argv.includes('--release'),
    force: argv.includes('--force'),
  };
}

function run(label, command, args) {
  console.log(`[update-all] ${label}…`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 1})`);
  }
}

function queryNpmVersion(pkg) {
  const result = spawnSync('npm', ['view', pkg, 'version'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const version = result.stdout?.trim().split(/\r?\n/).at(-1)?.trim() ?? '';
  if (result.status !== 0 || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
    throw new Error(`npm view ${pkg} version failed (${version || `exit ${result.status}`})`);
  }
  return version;
}

function electronBinaryPath() {
  const name = process.platform === 'win32' ? 'electron.exe' : 'electron';
  return path.join(root, 'node_modules', 'electron', 'dist', name);
}

function stopRunningApp() {
  if (process.platform !== 'win32') {
    spawnSync('pkill', ['-f', path.join(root, 'node_modules', 'electron')], { stdio: 'ignore' });
    return;
  }

  spawnSync('taskkill', ['/IM', 'Whiteboard4Share.exe', '/T', '/F'], { stdio: 'ignore' });
  const filter = JSON.stringify(`${root}\\*`);
  const ps = [
    `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |`,
    `Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like ${filter} } |`,
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
  ].join(' ');
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
}

async function writeElectronAllowScripts(version) {
  const pkgPath = path.join(root, 'package.json');
  let text = await fs.readFile(pkgPath, 'utf8');
  if (/"electron@[^"]+"\s*:\s*true/.test(text)) {
    text = text.replace(/"electron@[^"]+"\s*:\s*true/, `"electron@${version}": true`);
  } else if (/"allowScripts"\s*:\s*\{/.test(text)) {
    text = text.replace(/("allowScripts"\s*:\s*\{)/, `$1\n    "electron@${version}": true,`);
  } else {
    throw new Error('package.json is missing allowScripts; cannot install Electron');
  }
  await fs.writeFile(pkgPath, text);
  console.log(`[update-all] allowScripts electron@${version}`);
}

function assertElectronRuns(expectedVersion) {
  const binary = electronBinaryPath();
  const result = spawnSync(binary, ['--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20000,
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.status !== 0) {
    throw new Error(
      `Electron ${expectedVersion} did not start after update (${out || `exit ${result.status}`}). ` +
        'Refusing to leave a broken install.',
    );
  }
  console.log(`[update-all] Electron runs: ${out}`);
}

async function updateElectronLatest() {
  const electronVersion = queryNpmVersion('electron');
  const builderVersion = queryNpmVersion('electron-builder');
  await writeElectronAllowScripts(electronVersion);
  run('electron latest', 'npm', ['install', `electron@${electronVersion}`, '--save-dev']);
  run('electron-builder latest', 'npm', ['install', `electron-builder@${builderVersion}`, '--save-dev']);
  try {
    await fs.access(electronBinaryPath());
  } catch {
    console.log('[update-all] Electron binary missing; running install.js…');
    run('electron install.js', 'node', [path.join('node_modules', 'electron', 'install.js')]);
  }
  assertElectronRuns(electronVersion);
}

async function gitPull() {
  try {
    await fs.access(path.join(root, '.git'));
  } catch {
    console.log('[update-all] Not a git repo; skip git pull');
    return;
  }

  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.stdout?.trim()) {
    console.log('[update-all] Git working tree has local changes; skip git pull');
    return;
  }

  run('git pull', 'git', ['pull', '--ff-only']);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('[update-all] ===== started =====');
  console.log(`[update-all] Project root: ${root}`);

  const stopBat = path.join(root, 'stop_server.bat');
  try {
    await fs.access(stopBat);
    run('stop server', 'cmd.exe', ['/d', '/c', `${stopBat} _inner _quiet`]);
  } catch {
    console.log('[update-all] stop_server.bat not found; skip stop');
  }

  console.log('[update-all] Stopping running Whiteboard4Share / project Electron…');
  stopRunningApp();

  if (!opts.skipGit) {
    await gitPull();
  }

  if (!opts.skipNpm) {
    if (opts.force) {
      run('npm install --force', 'npm', ['install', '--force']);
    } else {
      run('npm install', 'npm', ['install']);
    }
    run('npm update', 'npm', ['update']);
    await updateElectronLatest();
    run('prepare icon', 'npm', ['run', 'prepare:icon']);
    run('build electron', 'npm', ['run', 'build:electron']);
  }

  if (opts.build) {
    run('build release (MSI + portable)', 'npm', ['run', 'build:release']);
  }

  console.log('[update-all] ===== finished =====');
}

main().catch((error) => {
  console.error('[update-all] ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
});
