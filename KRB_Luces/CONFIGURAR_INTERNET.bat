@echo off
title Luces KRB - acceso desde internet
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0internet.ps1"
pause
