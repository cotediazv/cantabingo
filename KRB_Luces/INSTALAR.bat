@echo off
title Luces KRB - instalar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
timeout /t 30
