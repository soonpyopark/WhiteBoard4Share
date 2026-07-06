@echo off
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo 관리자 권한이 필요합니다. UAC 창에서 [예]를 눌러 주세요.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "PORT=3007"
if exist ".env" (
  for /f "tokens=2 delims==" %%P in ('findstr /i /r /b "PORT=" ".env"') do set "PORT=%%P"
)
for /f "tokens=* delims= " %%a in ("%PORT%") do set "PORT=%%a"

set "RULE_PORT=Whiteboard4Share Inbound TCP %PORT%"
set "RULE_APP=Whiteboard4Share Inbound App"
set "EXE_PATH=%~dp0Whiteboard4Share.exe"

echo.
echo ========================================
echo  Whiteboard4Share 방화벽 인바운드 허용
echo ========================================
echo   TCP 포트 : %PORT%
echo   프로그램 : %EXE_PATH%
echo.

if exist "%EXE_PATH%" (
  netsh advfirewall firewall delete rule name="%RULE_APP%" >nul 2>&1
  netsh advfirewall firewall add rule name="%RULE_APP%" dir=in action=allow program="%EXE_PATH%" enable=yes profile=any
  if errorlevel 1 (
    echo [오류] Whiteboard4Share.exe 프로그램 규칙 추가에 실패했습니다.
    goto ERR
  )
  echo [완료] Whiteboard4Share.exe 인바운드 허용
) else (
  echo [안내] Whiteboard4Share.exe가 없어 포트 규칙만 추가합니다.
)

netsh advfirewall firewall delete rule name="%RULE_PORT%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE_PORT%" dir=in action=allow protocol=TCP localport=%PORT% enable=yes profile=any
if errorlevel 1 (
  echo [오류] TCP %PORT% 포트 규칙 추가에 실패했습니다.
  goto ERR
)
echo [완료] TCP %PORT% 인바운드 허용

echo.
echo LAN 접속: .env에 HOSTNAME=0.0.0.0 설정 후 exe를 다시 실행하세요.
echo 다른 PC 브라우저: http://^<이 PC IP^>:%PORT%
echo.
pause
exit /b 0

:ERR
echo.
pause
exit /b 1
