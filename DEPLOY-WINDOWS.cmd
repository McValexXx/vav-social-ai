@echo off
setlocal
pushd "%~dp0"

title VAV Social AI - Cloudflare Deploy
echo VAV Social AI - publicare Cloudflare
echo.

set "CLOUDFLARE_ACCOUNT_ID="
set "CLOUDFLARE_API_TOKEN="
set "CF_API_TOKEN="
set "CLOUDFLARE_API_KEY="
set "CLOUDFLARE_EMAIL="

where node >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap-node.ps1"
  if errorlevel 1 goto :failed
  set "PATH=%~dp0.node-runtime;%PATH%"
)

call npm ci
if errorlevel 1 goto :failed

echo.
echo Resetez autorizarea Wrangler locala...
call npx wrangler logout >nul 2>nul
echo Se deschide autorizarea Cloudflare prin cod device.
echo Introdu codul afisat in pagina Cloudflare si apasa Authorize.
call npx wrangler login --device
if errorlevel 1 goto :failed
call npx wrangler whoami
if errorlevel 1 goto :failed

call npm test
if errorlevel 1 goto :failed

call npm run typecheck
if errorlevel 1 goto :failed

call npx wrangler d1 migrations apply vav-social-ai --remote
if errorlevel 1 goto :failed

call npx wrangler deploy
if errorlevel 1 goto :failed

echo.
echo GATA: VAV Social AI Daily 3 a fost publicat.
echo Testeaza in Telegram:
echo /start
echo /topics
echo /topic 25
echo /random
echo /status
echo.
pause
exit /b 0

:failed
echo.
echo PUBLICAREA NU A REUSIT. Nu inchide aceasta fereastra; fotografiaza eroarea.
pause
exit /b 1
