import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number.parseInt(process.env.PORT ?? '3008', 10) || 3008;

function killPort(targetPort) {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano | findstr :${targetPort}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const pids = new Set();
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts.at(-1);
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } catch {
          /* process may already be gone */
        }
      }
    } catch {
      /* nothing listening */
    }
    return;
  }

  try {
    execSync(`lsof -ti:${targetPort} | xargs kill -9`, { stdio: 'ignore', shell: true });
  } catch {
    /* nothing listening */
  }
}

killPort(port);

const child = spawn('npm', ['run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
