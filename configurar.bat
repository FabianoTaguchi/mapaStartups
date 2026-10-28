@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao foi encontrado neste computador.
  echo Instale a versao LTS em https://nodejs.org, feche esta janela e rode configurar.bat de novo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
node configurar.js
pause
