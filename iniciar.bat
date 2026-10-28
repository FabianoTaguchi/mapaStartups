@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Sem .env: modo "Claude no chat", basta abrir a pagina.
if not exist .env (
  start "" "%~dp0index.html"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Rode configurar.bat primeiro.
  pause
  exit /b 1
)
if not exist node_modules call npm install
echo Mapa Startups rodando. Para parar, feche esta janela.
node server.js --abrir
pause
