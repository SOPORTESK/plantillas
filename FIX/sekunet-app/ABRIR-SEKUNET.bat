@echo off
setlocal

title SEKUNET - Iniciador

REM Ir a la carpeta del proyecto (donde está este .bat)
cd /d "%~dp0"

echo ==========================================
echo   SEKUNET Agente IA - Iniciando...
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado.
  echo Instale Node.js LTS y vuelva a intentar.
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm no esta disponible en este equipo.
  echo Reinstale Node.js LTS.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Primera ejecucion: instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
)

echo [INFO] Abriendo SEKUNET en Electron...
call npm run electron:dev

if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo iniciar SEKUNET.
  pause
  exit /b 1
)

endlocal
