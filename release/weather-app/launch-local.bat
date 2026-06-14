@echo off
REM Weather App Launcher — starts local server and opens browser automatically
REM Windows only; requires Python and default browser setup

setlocal enabledelayedexpansion

echo.
echo ========================================
echo  Hava Durumu Uygulaması (Weather App)
echo ========================================
echo.
echo Sunucu başlatılıyor... (Pressing Ctrl+C will stop the server)
echo.

REM Start the HTTP server in background and capture the process ID
start /B python -m http.server 8000 > nul 2>&1

REM Wait a moment for the server to start
timeout /t 2 /nobreak > nul

REM Get the local URL
set "URL=http://localhost:8000"

echo.
echo ✓ Sunucu başladı: %URL%
echo.
echo Tarayıcıda açılıyor...
echo.

REM Try to open the browser (works with default browser on Windows)
timeout /t 1 /nobreak > nul
start %URL%

echo.
echo ✓ Tarayıcı açılmalıdır.
echo.
echo SUNUCUYU KAPATMAK İÇİN: Ctrl+C tuşuna basın (aşağıdaki konsolda)
echo.
echo.

REM Keep the batch running so server stays alive (manual Ctrl+C to exit)
:wait_loop
timeout /t 60 /nobreak > nul
goto wait_loop
