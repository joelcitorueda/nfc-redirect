@echo off
echo.
echo  ========================================
echo   NFC Google Reviews - Sistema de Tarjetas
echo   Tarija, Bolivia
echo  ========================================
echo.
echo  Iniciando servidor...
echo.

cd /d "%~dp0"

:: Verificar si node_modules existe
if not exist "node_modules" (
    echo  Instalando dependencias por primera vez...
    npm install
    echo.
)

:: Iniciar el servidor
node server.js

pause
