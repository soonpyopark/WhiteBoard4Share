import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Rebuild the web UI (dist/), free the listen port, then launch Electron.
 * Electron serves dist/ (not Vite HMR), so restart must rebuild to pick up UI changes.
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} exited via ${signal}`));
      else if (code) reject(new Error(`${command} exited with code ${code}`));
      else resolve();
    });
  });
}

try {
  console.log('[restart] building web UI…');
  await run('npm', ['run', 'build']);
  await run('npm', ['run', 'start']);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
