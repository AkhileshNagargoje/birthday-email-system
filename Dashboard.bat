@echo off
REM Double-click to open the dashboard in your browser.
cd /d "%~dp0"
title Birthday Dashboard - keep this window open

python -c "import flask" 2>nul
if errorlevel 1 (
  echo Installing the dashboard the first time...
  python -m pip install flask
)

python -m src.dashboard

echo.
echo Dashboard stopped.
pause
