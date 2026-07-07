#Requires -Version 5.1
<#
.SYNOPSIS
  Whiteboard4Share - update git sources, npm/Electron stack, and optional portable exe build.

.PARAMETER SkipGit
  Skip git pull.

.PARAMETER SkipNpm
  Skip npm install/update and Electron asset rebuild.

.PARAMETER BuildDist
  Run npm run build:dist:exe after updates.

.PARAMETER Force
  Run npm install with --force and re-download the Electron binary.
#>
param(
    [switch]$SkipGit,
    [switch]$SkipNpm,
    [switch]$BuildDist,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root 'data\logs'
$LogFile = Join-Path $LogDir 'update-all.log'

function Write-UpdateLog {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Invoke-ProjectCommand {
    param(
        [string]$Label,
        [string[]]$Command
    )
    Write-UpdateLog $Label
    Push-Location $Root
    try {
        & $Command[0] @($Command[1..($Command.Length - 1)])
        if ($LASTEXITCODE -ne 0) {
            throw "$Label failed (exit $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }
}

function Stop-AppServerIfRunning {
    $stopBat = Join-Path $Root 'stop_server.bat'
    if (-not (Test-Path $stopBat)) {
        Write-UpdateLog 'stop_server.bat not found; skip stop'
        return
    }
    Write-UpdateLog 'Stopping Whiteboard4Share server if running...'
    & cmd.exe /d /c "`"$stopBat`" _inner _quiet" | Out-Null
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        throw "stop_server.bat failed (exit $code)"
    }
}

function Update-GitSources {
    if (-not (Test-Path (Join-Path $Root '.git'))) {
        Write-UpdateLog 'Not a git repo; skip git pull'
        return
    }
    $dirty = git -C $Root status --porcelain 2>$null
    if ($dirty) {
        Write-UpdateLog 'Git working tree has local changes; skip git pull'
        return
    }
    Invoke-ProjectCommand 'git pull' @('git', '-C', $Root, 'pull', '--ff-only')
}

function Ensure-ElectronBinary {
    $postinstall = Join-Path $Root 'scripts\postinstall-electron.mjs'
    if (-not (Test-Path $postinstall)) {
        Write-UpdateLog 'postinstall-electron.mjs not found; skip Electron binary check'
        return
    }
    Invoke-ProjectCommand 'ensure Electron binary' @('node', $postinstall)
}

function Update-NpmStack {
    if (-not (Test-Path (Join-Path $Root 'package.json'))) {
        Write-UpdateLog 'package.json not found; skip npm'
        return
    }

    if ($Force) {
        Invoke-ProjectCommand 'npm install --force' @('npm', 'install', '--force')
    } else {
        Invoke-ProjectCommand 'npm install' @('npm', 'install')
    }

    Invoke-ProjectCommand 'npm update (semver ranges)' @('npm', 'update')
    Ensure-ElectronBinary
    Invoke-ProjectCommand 'npm run prepare:icon' @('npm', 'run', 'prepare:icon')
    Invoke-ProjectCommand 'npm run build:electron' @('npm', 'run', 'build:electron')
}

Write-UpdateLog '===== update-all started ====='
Write-UpdateLog "Project root: $Root"

Stop-AppServerIfRunning

if (-not $SkipGit) { Update-GitSources }
if (-not $SkipNpm) { Update-NpmStack }

if ($BuildDist) {
    Invoke-ProjectCommand 'npm run build:dist:exe' @('npm', 'run', 'build:dist:exe')
}

Write-UpdateLog '===== update-all finished ====='
Write-Host ''
Write-Host '[OK] Update complete. Log:' $LogFile
