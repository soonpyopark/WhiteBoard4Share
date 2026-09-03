#Requires -Version 5.1
<#
.SYNOPSIS
  Whiteboard4Share - update git sources, npm/Electron stack, and optional MSI+zip release.

.PARAMETER SkipGit
  Skip git pull.

.PARAMETER SkipNpm
  Skip npm install/update and Electron latest.

.PARAMETER BuildDist
  Run npm run build:release after updates (MSI + portable zip under msi/).

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

$nodeArgs = @('scripts/update-all.mjs')
if ($SkipGit) { $nodeArgs += '--skip-git' }
if ($SkipNpm) { $nodeArgs += '--skip-npm' }
if ($BuildDist) { $nodeArgs += '--release' }
if ($Force) { $nodeArgs += '--force' }

Write-UpdateLog '===== update-all started ====='
Write-UpdateLog "Project root: $Root"
Write-UpdateLog "Log file: $LogFile"

Push-Location $Root
try {
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "update-all.mjs failed (exit $LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

Write-UpdateLog '===== update-all finished ====='
Write-Host ''
Write-Host '[OK] Update complete. Log:' $LogFile
