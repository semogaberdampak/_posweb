@echo off
rem Membuka aplikasi kasir dengan CETAK LANGSUNG (tanpa dialog) ke printer default Windows.
rem Pastikan printer thermal sudah dijadikan printer default di Windows.
rem Pakai:  scripts\kasir-kiosk.cmd [alamat-aplikasi]
rem Contoh: scripts\kasir-kiosk.cmd https://domain-anda/_posweb/
rem Profil browser dipisah (pos-kasir-profile) agar mode cetak langsung hanya berlaku untuk aplikasi kasir ini.
set "URL=%~1"
if "%URL%"=="" set "URL=http://127.0.0.1:5173/"
set "PROFILE=%LOCALAPPDATA%\pos-kasir-profile"
start "" chrome --kiosk-printing --user-data-dir="%PROFILE%" --app="%URL%" 2>nul
if errorlevel 1 start "" msedge --kiosk-printing --user-data-dir="%PROFILE%" --app="%URL%"
