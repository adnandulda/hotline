@echo off
chcp 65001 >nul
title Bizim Discord Sunucusu
echo ===================================================
echo            BIZIM DISCORD baslatiliyor...
echo ===================================================
echo.

REM Node.js kurulu mu kontrol et
where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi!
  echo.
  echo Once Node.js kur:  https://nodejs.org  ^(LTS surumunu indir, kur, sonra bu dosyayi tekrar cift tikla^)
  echo.
  pause
  exit /b
)

echo Sunucu baslatiliyor... Tarayicidan acmak icin:  http://localhost:3000
echo Durdurmak icin bu pencereyi kapat.
echo.
node server.js
pause
