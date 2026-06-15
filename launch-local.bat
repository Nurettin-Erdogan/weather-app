@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON=py -3"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3 bulunamadi. https://www.python.org/downloads/ adresinden yukleyin.
    pause
    exit /b 1
  )
  set "PYTHON=python"
)

start "Weather App Server" /min cmd /c "%PYTHON% -m http.server 8000 --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000"
echo Hava Durumu http://127.0.0.1:8000 adresinde acildi.
echo Sunucuyu kapatmak icin "Weather App Server" penceresini kapatin.
