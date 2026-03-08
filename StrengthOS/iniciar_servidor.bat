@echo off
color 0A
title Servidor StrengthOS Backend

echo ===================================================
echo   INICIANDO EL SERVIDOR DE BASE DE DATOS STRENGTHOS
echo ===================================================
echo.
echo Por favor, no cierres esta ventana negra mientras 
echo alguien este usando la web o el panel de control.
echo.
echo Para apagar el servidor de forma segura, presiona CTRL+C
echo.

python app.py

echo.
echo El servidor se ha detenido por un error.
pause
