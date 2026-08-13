@echo off
REM Double-click this file. No commands to remember.
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Birthday Email System

:menu
cls
echo.
echo   ================================================
echo      BIRTHDAY EMAIL SYSTEM
echo   ================================================
echo.
echo     SETUP
echo       1  Edit the student list
echo       2  Edit settings (email account)
echo       3  Check the student list for mistakes
echo.
echo     TRY IT OUT  (nothing is sent)
echo       4  Preview a poster
echo       5  Test run - today
echo       6  Test run - pick a date
echo       7  Show upcoming birthdays
echo.
echo     FOR REAL
echo       8  Send today's wishes now
echo       9  Turn ON automatic daily sending
echo      10  Turn OFF automatic daily sending
echo      11  See what was sent recently
echo.
echo       0  Exit
echo.
set "choice="
set /p "choice=   Type a number and press Enter: "

REM If there is no keyboard attached (piped or scheduled), set /p leaves
REM choice empty and this would spin forever. Bail out after a few.
if "%choice%"=="" (
  set /a blanks+=1
  if !blanks! geq 5 goto end
  goto menu
)
set "blanks=0"

if "%choice%"=="1"  goto students
if "%choice%"=="2"  goto settings
if "%choice%"=="3"  goto validate
if "%choice%"=="4"  goto preview
if "%choice%"=="5"  goto testtoday
if "%choice%"=="6"  goto testdate
if "%choice%"=="7"  goto upcoming
if "%choice%"=="8"  goto sendreal
if "%choice%"=="9"  goto schedule
if "%choice%"=="10" goto unschedule
if "%choice%"=="11" goto history
if "%choice%"=="0"  goto end
goto menu


:students
if not exist "data\students.csv" copy "data\students.example.csv" "data\students.csv" >nul
echo.
echo   Opening the student list...
echo   Keep the top header row. Save and close when done.
start "" "data\students.csv"
echo.
pause
goto menu


:settings
if not exist ".env" copy ".env.example" ".env" >nul
echo.
echo   Opening settings in Notepad.
echo.
echo   The ones that matter:
echo     EMAIL_USER  - the address that sends the wishes
echo     EMAIL_PASS  - its app password (NOT the normal password)
echo     TEST_EMAIL  - while this is filled in, every wish comes to
echo                   you instead of to students. Leave it set until
echo                   you have seen one and are happy.
echo.
start /wait notepad ".env"
goto menu


:validate
cls
echo.
python -m src.main --validate
echo.
pause
goto menu


:preview
cls
echo.
set "pname="
set /p "pname=   Name to put on the poster: "
if "!pname!"=="" goto menu
python -m src.main --preview "!pname!"
if exist "out\preview.png" start "" "out\preview.png"
echo.
pause
goto menu


:testtoday
cls
echo.
echo   TEST RUN - no email will be sent.
echo.
python -m src.main --dry-run
echo.
echo   Any posters were saved in the "out" folder.
echo.
pause
goto menu


:testdate
cls
echo.
set "pdate="
set /p "pdate=   Date to pretend it is (like 2026-08-13): "
if "!pdate!"=="" goto menu
echo.
python -m src.main --dry-run --date "!pdate!"
echo.
pause
goto menu


:upcoming
cls
echo.
set "pdays="
set /p "pdays=   Look ahead how many days? (Enter for 30): "
if "!pdays!"=="" set "pdays=30"
echo.
python -m src.main --upcoming !pdays!
echo.
pause
goto menu


:sendreal
cls
echo.
echo   ------------------------------------------------
echo    This sends real email to real students, now.
echo    It cannot be undone.
echo   ------------------------------------------------
echo.
echo    If TEST_EMAIL is still set in settings, everything
echo    comes to you instead - which is the safe way to
echo    try this the first time.
echo.
set "sure="
set /p "sure=   Type YES to send, anything else to cancel: "
if /i not "!sure!"=="YES" (
  echo.
  echo   Cancelled. Nothing was sent.
  echo.
  pause
  goto menu
)
echo.
python -m src.main
echo.
pause
goto menu


:schedule
cls
echo.
set "attime="
set /p "attime=   Send every day at what time? (Enter for 08:00): "
if "!attime!"=="" set "attime=08:00"
echo.
schtasks /create /tn "Birthday Email System" /tr "\"%~dp0run_daily.bat\"" /sc daily /st !attime! /f
if errorlevel 1 (
  echo.
  echo   Could not create the task. Try right-clicking Start.bat
  echo   and choosing "Run as administrator".
) else (
  echo.
  echo   Done. Wishes will now go out automatically at !attime! every day.
  echo   Your PC needs to be switched on at that time.
)
echo.
pause
goto menu


:unschedule
cls
echo.
schtasks /delete /tn "Birthday Email System" /f
if errorlevel 1 (
  echo.
  echo   Nothing to turn off - automatic sending was not set up.
) else (
  echo.
  echo   Automatic sending is now OFF.
)
echo.
pause
goto menu


:history
cls
echo.
if exist "logs\sent_log.csv" (
  echo   Opening the record of everyone wished so far...
  start "" "logs\sent_log.csv"
) else (
  echo   Nothing has been sent yet.
)
echo.
pause
goto menu


:end
endlocal
exit /b 0
