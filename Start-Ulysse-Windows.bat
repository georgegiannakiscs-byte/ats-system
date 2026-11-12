@echo off
rem Ulysse - one-click local start for Windows. Needs Docker Desktop.
rem Builds and starts Ulysse with its database, adds demo data and opens http://localhost:3000.
rem The first run takes a few minutes; later runs are fast.
title Ulysse - local start
cd /d "%~dp0"
echo === Ulysse: local start ===

where docker >nul 2>&1
if errorlevel 1 (
  start "" "https://www.docker.com/products/docker-desktop/"
  echo.
  echo Docker Desktop is not installed. Install it from the page that just opened,
  echo start it once, then double-click this file again.
  goto fail
)

docker info >nul 2>&1
if not errorlevel 1 goto docker_ok
echo Starting Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a tries=0
:wait_docker
timeout /t 2 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok
set /a tries+=1
if %tries% lss 90 goto wait_docker
echo.
echo Docker Desktop did not start. Open Docker Desktop, wait until it says it is running,
echo then double-click this file again.
goto fail

:docker_ok
if exist .env goto env_ok
echo Creating local settings (.env)...
for /f %%s in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')"') do set "SECRET=%%s"
if "%SECRET%"=="" (
  echo Could not create a secret key.
  goto fail
)
> .env echo APP_SECRET=%SECRET%
>> .env echo PLATFORM_ADMIN_EMAILS=demo@example.com

:env_ok
echo Building and starting Ulysse (the first time this takes a few minutes)...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Ulysse could not be started. Copy the messages above and send them to whoever helps you.
  goto fail
)

echo Waiting for Ulysse and adding demo data...
docker compose --profile demo run --rm seed
if errorlevel 1 (
  echo.
  echo Ulysse started, but the demo data could not be added. Copy the messages above.
  goto fail
)

start "" "http://localhost:3000/login"
echo.
echo Ulysse is running at http://localhost:3000
echo Sign in with  demo@example.com  /  Ulysse-demo-2026
echo To stop it: Docker Desktop ^> Containers ^> ats-system ^> Stop.
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
