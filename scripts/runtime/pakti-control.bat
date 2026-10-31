@echo off
rem Buka Pakti Control Panel (minta UAC sekali, lalu ikon muncul di tray).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0pakti-control.ps1"
