import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_PORT } from '../config/ports.ts';
import { normalizeWebServerPort } from '../shared/webServerConfig.ts';

const execFileAsync = promisify(execFile);

export function firewallRuleName(port: number): string {
  return `Whiteboard4Share LAN (${port})`;
}

function resolveTargetPort(port: unknown): number {
  return normalizeWebServerPort(port) ?? DEFAULT_PORT;
}

export async function allowFirewallInbound(
  port: unknown,
): Promise<{ ok: boolean; message: string; port: number }> {
  const target = resolveTargetPort(port);
  if (process.platform !== 'win32') {
    return { ok: false, message: 'Windows에서만 방화벽 규칙을 추가할 수 있습니다.', port: target };
  }

  const name = firewallRuleName(target);
  const success = {
    ok: true,
    message: `방화벽 인바운드 허용 규칙을 추가했습니다.\nTCP ${target} (${name})`,
    port: target,
  };

  try {
    await runNetshAllow(name, target);
    return success;
  } catch (firstErr) {
    try {
      await runNetshAllowElevated(name, target);
      return success;
    } catch (elevatedErr) {
      return {
        ok: false,
        message: `방화벽 규칙을 추가하지 못했습니다.\n관리자 권한(UAC)을 허용했는지 확인해 주세요.\n${describeError(elevatedErr, firstErr)}`,
        port: target,
      };
    }
  }
}

export async function removeFirewallInbound(
  port: unknown,
): Promise<{ ok: boolean; message: string; port: number }> {
  const target = resolveTargetPort(port);
  if (process.platform !== 'win32') {
    return { ok: false, message: 'Windows에서만 방화벽 규칙을 제거할 수 있습니다.', port: target };
  }

  const name = firewallRuleName(target);
  const removed = {
    ok: true,
    message: `방화벽 인바운드 허용 규칙을 제거했습니다.\nTCP ${target} (${name})`,
    port: target,
  };

  try {
    await runNetshDelete(name);
    return removed;
  } catch (firstErr) {
    if (!isAccessDeniedError(firstErr)) {
      return {
        ok: true,
        message: `방화벽 규칙이 없거나 이미 제거되었습니다.\nTCP ${target} (${name})`,
        port: target,
      };
    }
    try {
      await runNetshDeleteElevated(name);
      return removed;
    } catch (elevatedErr) {
      return {
        ok: false,
        message: `방화벽 규칙을 제거하지 못했습니다.\n관리자 권한(UAC)을 허용했는지 확인해 주세요.\n${describeError(elevatedErr, firstErr)}`,
        port: target,
      };
    }
  }
}

async function runNetshAllow(name: string, port: number): Promise<void> {
  await runNetshDelete(name).catch(() => undefined);
  await execFileAsync(
    'netsh',
    [
      'advfirewall',
      'firewall',
      'add',
      'rule',
      `name=${name}`,
      'dir=in',
      'action=allow',
      'protocol=TCP',
      `localport=${port}`,
    ],
    { windowsHide: true },
  );
}

async function runNetshDelete(name: string): Promise<void> {
  await execFileAsync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`], {
    windowsHide: true,
  });
}

async function runNetshAllowElevated(name: string, port: number): Promise<void> {
  const script =
    `$ErrorActionPreference='Continue'; ` +
    `netsh advfirewall firewall delete rule name="${name}" | Out-Null; ` +
    `$ErrorActionPreference='Stop'; ` +
    `netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port}; ` +
    `if ($LASTEXITCODE -ne 0) { throw "netsh exit $LASTEXITCODE" }`;
  await runElevatedEncoded(script);
}

async function runNetshDeleteElevated(name: string): Promise<void> {
  const script =
    `$ErrorActionPreference='Continue'; ` +
    `netsh advfirewall firewall delete rule name="${name}" | Out-Null; ` +
    `exit 0`;
  await runElevatedEncoded(script);
}

async function runElevatedEncoded(script: string): Promise<void> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const command =
    `Start-Process -Wait -Verb RunAs -FilePath powershell.exe ` +
    `-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}')`;

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { windowsHide: true },
  );
}

function collectExecErrorText(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { message?: string; stderr?: unknown; stdout?: unknown };
  return [e.message, String(e.stderr ?? ''), String(e.stdout ?? '')].join('\n');
}

function describeError(elevatedErr: unknown, firstErr: unknown): string {
  if (elevatedErr instanceof Error) return elevatedErr.message;
  if (firstErr instanceof Error) return firstErr.message;
  return String(elevatedErr);
}

function isAccessDeniedError(err: unknown): boolean {
  return /access is denied|요청한 작업에는|상승된 권한|Administrator|권한/i.test(
    collectExecErrorText(err),
  );
}
