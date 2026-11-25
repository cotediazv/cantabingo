@echo off
title Luces KRB - estacion de ritmo
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0estacion.ps1"
timeout /t 30
