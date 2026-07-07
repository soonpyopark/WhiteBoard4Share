@echo off
cd /d "%~dp0"

if /I not "%~1"=="_inner" (
    call "%~f0" _inner %*
    set "EXIT_CODE=%ERRORLEVEL%"
    if /I not "%~2"=="_quiet" if /I not "%~3"=="_quiet" pause
    exit /b %EXIT_CODE%
)
if /I "%~1"=="_inner" shift
if /I "%~1"=="_quiet" set "QUIET=1" & shift

set PORT=3007
if exist ".env" for /f "tokens=2 delims==" %%P in ('findstr /i /b "PORT=" ".env"') do set PORT=%%P

if not defined QUIET echo Stopping Whiteboard4Share server on port %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    if not defined QUIET echo   kill PID %%p
    taskkill /F /PID %%p >nul 2>&1
)
if not defined QUIET echo Done.
exit /b 0
