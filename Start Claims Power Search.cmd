@echo off
setlocal
set "CLAIMS_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%CLAIMS_PYTHON%" (
  echo The Codex Python runtime was not found. Open Codex and ask it to refresh workspace dependencies.
  pause
  exit /b 1
)
cd /d "%~dp0"
"%CLAIMS_PYTHON%" app.py
if errorlevel 1 (
  echo.
  echo If Claims Power Search is already running, open http://127.0.0.1:8777 in your browser.
  pause
)
