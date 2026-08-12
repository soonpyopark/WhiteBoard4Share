import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnvPort() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return null;
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^PORT\s*=\s*(.*)$/.exec(trimmed);
      if (!match) continue;
      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function loadSettingsPort() {
  const candidates = [
    path.join(root, 'data', '.wb4s-settings.json'),
    path.join(root, '.wb4s-settings.json'), // legacy app-root location
  ];
  for (const settingsPath of candidates) {
    if (!fs.existsSync(settingsPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const value = Number(parsed?.webServerPort);
      if (Number.isFinite(value) && value >= 1 && value <= 65535) {
        return String(Math.trunc(value));
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const port =
  Number.parseInt(
    process.env.PORT ?? loadDotEnvPort() ?? loadSettingsPort() ?? '3008',
    10,
  ) || 3008;

function killPort(targetPort) {
  if (process.platform === 'win32') {
    try {
      const ps = [
        `$conns = Get-NetTCPConnection -LocalPort ${targetPort} -State Listen -ErrorAction SilentlyContinue;`,
        `if (-not $conns) { exit 0 };`,
        `$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique;`,
        `foreach ($procId in $pids) {`,
        `  if ($procId -and $procId -ne 0) {`,
        `    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue;`,
        `    Write-Output $procId`,
        `  }`,
        `}`,
      ].join(' ');
      const output = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`,
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 15_000,
        },
      );
      for (const pid of output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
        console.log(`[start] freed port ${targetPort} (pid ${pid})`);
      }
    } catch {
      /* nothing listening or PowerShell unavailable — try netstat fallback */
      try {
        const output = execSync('netstat -ano -p tcp', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 10_000,
        });
        const pids = new Set();
        const needle = `:${targetPort}`;
        for (const line of output.split(/\r?\n/)) {
          if (!line.includes('LISTENING')) continue;
          const parts = line.trim().split(/\s+/);
          const local = parts[1] ?? '';
          if (!local.endsWith(needle)) continue;
          const pid = parts.at(-1);
          if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /PID ${pid} /T /F`, {
              stdio: 'ignore',
              timeout: 10_000,
            });
            console.log(`[start] freed port ${targetPort} (pid ${pid})`);
          } catch {
            /* process may already be gone */
          }
        }
      } catch {
        /* nothing listening */
      }
    }
    return;
  }

  try {
    const output = execSync(`lsof -tiTCP:${targetPort} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 10_000,
    });
    for (const pid of output.split(/\s+/).filter(Boolean)) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore', timeout: 5_000 });
        console.log(`[start] freed port ${targetPort} (pid ${pid})`);
      } catch {
        /* process may already be gone */
      }
    }
  } catch {
    /* nothing listening */
  }
}

function resolveElectronPath() {
  try {
    return require('electron');
  } catch {
    console.error(
      '[start] Electron binary is missing. Run:\n' +
        '  npm approve-scripts electron\n' +
        '  node node_modules/electron/install.js',
    );
    process.exit(1);
  }
}

function ensureDist() {
  const indexHtml = path.join(root, 'dist', 'index.html');
  if (fs.existsSync(indexHtml)) return;
  console.log('[start] dist/ missing — building…');
  execSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
}

function ensureElectronDist() {
  console.log('[start] building Electron main…');
  execSync('node scripts/build-electron.mjs', {
    cwd: root,
    stdio: 'inherit',
  });
}

ensureDist();
ensureElectronDist();

console.log(`[start] ensuring port ${port} is free…`);
killPort(port);

const electronPath = resolveElectronPath();
const electron = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    // Production-like: Electron owns Express (no Vite / ELECTRON_DEV).
    ELECTRON_DEV: '',
    VITE_DEV_SERVER_URL: '',
  },
});

electron.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
