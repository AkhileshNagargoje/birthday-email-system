@echo off
REM Daily birthday mailer. Point Windows Task Scheduler at this file.
REM Task Scheduler ignores the working directory, so set it explicitly.

cd /d "%~dp0"

REM If you use a virtual environment, uncomment the next line:
REM call .venv\Scripts\activate.bat

python -m src.main >> "logs\run.log" 2>&1

exit /b %ERRORLEVEL%
