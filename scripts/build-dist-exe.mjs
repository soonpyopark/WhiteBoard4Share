import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RELEASE_STAGING_DIR,
  resolveReleaseBuildStamp,
  shouldReleasePortable,
  shouldSkipPublish,
  shouldSkipStamp,
  toFileStamp,
  writeAppBuildStamp,
} from './stamp-build.mjs';

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

/** Prefer SEVEN_ZIP env, then Program Files, then PATH. */
function resolve7z() {
  const fromEnv = process.env.SEVEN_ZIP?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates = [
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', '7-Zip', '7z.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', '7-Zip', '7z.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const which = execSync('where.exe 7z', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith('7z.exe'));
    if (which && fs.existsSync(which)) return which;
  } catch {
    /* not on PATH */
  }

  throw new Error(
    '7-Zip not found. Install 7-Zip or set SEVEN_ZIP to 7z.exe (e.g. C:\\Program Files\\7-Zip\\7z.exe)',
  );
}

function zipPortableFolder(sevenZip, folderPath, zipPath) {
  fs.rmSync(zipPath, { force: true });
  // Zip the folder so extract yields "Whiteboard4Share-…/…"
  const args = ['a', '-tzip', '-mx=9', '-y', zipPath, path.basename(folderPath)];
  console.log(`> ${sevenZip} ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
  execFileSync(sevenZip, args, {
    stdio: 'inherit',
    cwd: path.dirname(folderPath),
  });
  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`Portable zip: ${zipPath} (${sizeMb} MB)`);
  return zipPath;
}

/** Portable exe ships an empty but ready data tree (no whiteboard copies). */
function seedCleanDataDir(dataDest) {
  fs.rmSync(dataDest, { recursive: true, force: true });
  const folders = ['업무폴더', '개인폴더'];
  for (const folder of folders) {
    fs.mkdirSync(path.join(dataDest, folder), { recursive: true });
  }
  fs.writeFileSync(
    path.join(dataDest, '.wb4s-folders.json'),
    `${JSON.stringify(
      {
        folders: folders.map((id) => ({ id, name: id })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(dataDest, '.wb4s-members.json'),
    `${JSON.stringify({ version: 1, members: [] }, null, 2)}\n`,
    'utf8',
  );
}

const stamp = resolveReleaseBuildStamp();
if (shouldSkipStamp()) {
  console.log(`[build:dist:exe] reusing buildStamp=${stamp} (WB4S_SKIP_STAMP)`);
} else {
  writeAppBuildStamp(stamp);
  console.log(`[build:dist:exe] stamping buildStamp=${stamp}`);
}

const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const releasePortable = shouldReleasePortable();
const fileStamp = toFileStamp(stamp);
const buildName = releasePortable
  ? `Whiteboard4Share v${pkg.version}_${fileStamp}`
  : `Whiteboard4Share-${pkg.version}-${stamp}`;
const finalOutDir = releasePortable
  ? path.join(os.tmpdir(), 'wb-release-portable', buildName)
  : path.resolve('exe', buildName);
const portableZipPath = releasePortable
  ? path.resolve('msi', `${buildName}_portable.zip`)
  : path.resolve('exe', `${buildName}_portable.zip`);
const stagingOutDir = shouldSkipPublish()
  ? RELEASE_STAGING_DIR
  : path.join(os.tmpdir(), `wb-exe-build-${buildName.replace(/[^\w.-]+/g, '-')}`);

if (!releasePortable) {
  fs.mkdirSync('exe', { recursive: true });
}
fs.mkdirSync(path.dirname(portableZipPath), { recursive: true });
if (fs.existsSync(finalOutDir)) {
  fs.rmSync(finalOutDir, { recursive: true, force: true });
}
fs.rmSync(portableZipPath, { force: true });

console.log(`\nBuilding USB-ready app folder: ${buildName}`);
console.log(
  releasePortable
    ? `Release portable zip: msi\\${path.basename(portableZipPath)}\n`
    : `Output directory: exe\\${buildName}\n`,
);

let winUnpackedDir;
if (shouldSkipPublish()) {
  console.log(`[build:dist:exe] reusing publish output → ${RELEASE_STAGING_DIR}`);
  winUnpackedDir = path.join(RELEASE_STAGING_DIR, 'win-unpacked');
} else {
  if (fs.existsSync(stagingOutDir)) {
    fs.rmSync(stagingOutDir, { recursive: true, force: true });
  }
  execSync('node scripts/prepare-icon.mjs', { stdio: 'inherit' });
  execSync('npm run build', { stdio: 'inherit' });
  execSync('node scripts/build-electron.mjs', { stdio: 'inherit' });

  const builderCmd = [
    'npx electron-builder',
    '--win dir',
    `--config.directories.output="${stagingOutDir}"`,
  ].join(' ');

  execSync(builderCmd, { stdio: 'inherit' });
  winUnpackedDir = path.join(stagingOutDir, 'win-unpacked');
}

if (!fs.existsSync(winUnpackedDir)) {
  throw new Error(`Expected build output not found: ${winUnpackedDir}`);
}

copyDirectory(winUnpackedDir, finalOutDir);
fs.rmSync(path.join(finalOutDir, '.wb4s'), { recursive: true, force: true });

const dataDest = path.join(finalOutDir, 'data');
console.log('Seeding clean data/ (업무폴더, 개인폴더 + meta)…');
seedCleanDataDir(dataDest);

const envExampleSrc = path.resolve('.env.example');
if (fs.existsSync(envExampleSrc)) {
  fs.copyFileSync(envExampleSrc, path.join(finalOutDir, '.env.example'));
}

const firewallBatSrc = path.resolve('allow-firewall-inbound.bat');
if (fs.existsSync(firewallBatSrc)) {
  fs.copyFileSync(firewallBatSrc, path.join(finalOutDir, 'allow-firewall-inbound.bat'));
}

if (!shouldSkipPublish() && stagingOutDir !== RELEASE_STAGING_DIR) {
  fs.rmSync(stagingOutDir, { recursive: true, force: true });
}

const sevenZip = resolve7z();
console.log(`\nPacking portable zip with 7-Zip: ${sevenZip}`);
zipPortableFolder(sevenZip, finalOutDir, portableZipPath);

if (releasePortable) {
  fs.rmSync(finalOutDir, { recursive: true, force: true });
  console.log(`\nDone. Portable zip:\n  ${portableZipPath}\n`);
} else {
  console.log(
    `\nDone. USB folder:\n  ${finalOutDir}\nPortable zip:\n  ${portableZipPath}\n  (whiteboard data: ${path.join(finalOutDir, 'data')})\n  (LAN: copy .env.example to .env, set HOSTNAME=0.0.0.0, run allow-firewall-inbound.bat as admin)\n`,
  );
}
