@echo off
setlocal
cd /d "%~dp0"

set "APP_EXE=%~dp0release\win-unpacked\SEKUNET Agente IA.exe"
set "APP_ICON=%~dp0public\logo.ico"

if not exist "%APP_EXE%" (
  echo [ERROR] No se encontro la app compilada en:
  echo %APP_EXE%
  echo Primero ejecute: npm run electron:build
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop=[Environment]::GetFolderPath('Desktop');" ^
  "$startMenu=[Environment]::GetFolderPath('Programs');" ^
  "$target='%APP_EXE%';" ^
  "$icon=(Test-Path '%APP_ICON%') ? '%APP_ICON%' : '%APP_EXE%';" ^
  "$w=New-Object -ComObject WScript.Shell;" ^
  "$s1=$w.CreateShortcut((Join-Path $desktop 'SEKUNET Agente IA.lnk'));" ^
  "$s1.TargetPath=$target; $s1.WorkingDirectory=(Split-Path $target); $s1.IconLocation=$icon; $s1.Save();" ^
  "$s2=$w.CreateShortcut((Join-Path $startMenu 'SEKUNET Agente IA.lnk'));" ^
  "$s2.TargetPath=$target; $s2.WorkingDirectory=(Split-Path $target); $s2.IconLocation=$icon; $s2.Save();"

echo [OK] Acceso directo creado en Escritorio y Menu Inicio.
echo Puede abrir SEKUNET con doble clic desde ahora.
pause
endlocal
