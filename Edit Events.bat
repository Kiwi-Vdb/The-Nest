@echo off
setlocal
cd /d "%~dp0"

echo Opening The Nest Event Manager...
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 events_editor.py
) else (
  python events_editor.py
)

if errorlevel 1 (
  echo.
  echo The Event Manager could not start.
  pause
)
endlocal
