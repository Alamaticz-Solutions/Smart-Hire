@echo off
echo ================================================
echo  Hire AI - Single Server Unified Launcher
echo ================================================

:: Check and install backend environment if it doesn't exist
if not exist "%~dp0.venv\" (
    echo ================================================
    echo  First-time setup: Creating Backend environment
    echo ================================================
    python -m venv .venv
    call "%~dp0.venv\Scripts\activate.bat"
    pip install -r backend\requirements.txt
) else (
    call "%~dp0.venv\Scripts\activate.bat"
)

:: Build frontend to ensure we run the updated version
echo ================================================
echo  Building Frontend to include latest changes...
echo ================================================
cd "%~dp0frontend"
if not exist "node_modules\" call npm install
call npm run build
cd "%~dp0"


:: Stop any existing servers to avoid port conflicts
echo Stopping any existing instances on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a >nul 2>&1

:: Display access URLs
echo.
echo ================================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr IPv4') do set "IP=%%a"
set IP=%IP: =%
echo  Application is starting!
echo  Access it here:  http://127.0.0.1:8000
echo  Network Access:  http://%IP%:8000
echo ================================================
echo.

:: Open browser automatically
ping -n 4 127.0.0.1 >nul
start http://localhost:8000

:: Start FastAPI backend in the current window
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
