@echo off
chcp 949 >nul 2>&1

REM ============================================================================
REM  Whiteboard4Share - Update all components to latest
REM  git pull + npm/Electron + optional portable exe rebuild
REM ============================================================================

if /I not "%~1"=="_inner" if /I not "%~1"=="_quiet" (
    call "%~f0" _inner %*
    set "EXIT_CODE=%ERRORLEVEL%"
    echo.
    pause
    exit /b %EXIT_CODE%
)
if /I "%~1"=="_inner" shift
if /I "%~1"=="_quiet" shift

setlocal EnableExtensions

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" (
    echo [ERROR] PowerShell not found
    exit /b 1
)

set "USB_ROOT=%~dp0"
if "%USB_ROOT:~-1%"=="\" set "USB_ROOT=%USB_ROOT:~0,-1%"

set "EXTRA_ARGS="

:parse_args
if "%~1"=="" goto run
if /I "%~1"=="build" (
    set "EXTRA_ARGS=%EXTRA_ARGS% -BuildDist"
    shift
    goto parse_args
)
if /I "%~1"=="force" (
    set "EXTRA_ARGS=%EXTRA_ARGS% -Force"
    shift
    goto parse_args
)
if /I "%~1"=="skip-git" (
    set "EXTRA_ARGS=%EXTRA_ARGS% -SkipGit"
    shift
    goto parse_args
)
if /I "%~1"=="skip-npm" (
    set "EXTRA_ARGS=%EXTRA_ARGS% -SkipNpm"
    shift
    goto parse_args
)
set "EXTRA_ARGS=%EXTRA_ARGS% %~1"
shift
goto parse_args

:run
echo.
echo ============================================================
echo  Whiteboard4Share - update_all
echo ============================================================
echo  Root : %USB_ROOT%
echo  Log  : data\logs\update-all.log
echo.
echo  Options: build force skip-git skip-npm
echo ============================================================
echo.

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\scripts\update-all.ps1" %EXTRA_ARGS%
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
