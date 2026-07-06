import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number.parseInt(process.env.PORT ?? '3007', 10) || 3007;
const devUrl = `http://127.0.0.1:${port}`;

execSync('node scripts/build-electron.mjs', { cwd: root, stdio: 'inherit' });

function resolveElectronPath() {
  try {
    return require('electron');
  } catch {
    console.error(
      '[dev] Electron binary is missing. Run:\n' +
        '  npm approve-scripts electron\n' +
        '  node node_modules/electron/install.js',
    );
    process.exit(1);
  }
}

const electronPath = resolveElectronPath();

async function waitForDevServer(url, timeoutMs = 60_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return;
    } catch {
      /* Vite is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Dev server not ready at ${url}`);
}

await waitForDevServer(devUrl);

const electron = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_DEV: '1',
    VITE_DEV_SERVER_URL: devUrl,
  },
});

electron.on('exit', (code) => {
  process.exit(code ?? 0);
});
