@echo off
title Luces KRB
echo.
echo   Abriendo la suite de luces en segundo plano (sin ventana)...
del /q "%~dp0detenida.txt" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*krb_luces.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
start "" wscript.exe "%~dp0INICIAR_OCULTO.vbs"
echo   Listo. La suite queda corriendo sola; si se cae, se vuelve a abrir.
echo   Lo que va pasando queda en registro.txt. Para detenerla: DETENER.bat
timeout /t 6 >nul
