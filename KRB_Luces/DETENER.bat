@echo off
title Luces KRB - detener
echo.
echo   Deteniendo la suite de luces (tambien la que corre oculta)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*krb_luces.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('  Detenida (proceso ' + $_.ProcessId + ')') }"
echo   Listo. Para volver a abrirla: INICIAR.bat
echo.
pause
