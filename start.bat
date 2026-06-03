@echo off
cd /d "%~dp0"
echo ================================================
echo  Hire AI - Starting Backend and Frontend
echo ================================================

:: Check and install frontend modules if they don't exist
if not exist "%~dp0frontend\node_modules\" (
    echo ================================================
    echo  First-time setup: Installing Frontend packages
    echo ================================================
    cd "%~dp0frontend"
    call npm install
    cd "%~dp0"
)

:: Check and install backend environment if it doesn't exist
if not exist "%~dp0.venv\" (
    echo ================================================
    echo  First-time setup: Creating Backend environment
    echo ================================================
    python -m venv .venv
    call "%~dp0.venv\Scripts\activate.bat"
    pip install -r backend\requirements.txt
)

:: Stop any existing servers to avoid port conflicts
echo Stopping any existing instances on port 8000 and 5173...
powershell -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess -Force" >nul 2>&1
powershell -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess -Force" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1

:: Start FastAPI backend in its own window (Removed --reload to prevent crash on file upload)
echo Starting FastAPI backend on port 8000...
Start "Hire AI - Backend" /D "%~dp0" cmd /k ".\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"

:: Give backend 4 seconds to start
ping -n 5 127.0.0.1 >nul

:: Start React dev server in its own window (Use cmd /k to keep window open if it errors)
echo Starting React frontend on port 5173...
Start "Hire AI - Frontend" /D "%~dp0frontend" cmd /k "npm run dev"


echo.
echo ================================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr IPv4') do set "IP=%%a"
set IP=%IP: =%
echo  Backend:  http://127.0.0.1:8000 (or http://%IP%:8000)
echo  Frontend: http://127.0.0.1:5173 (or http://%IP%:5173)
echo  API Docs: http://127.0.0.1:8000/docs
echo ================================================
ping -n 12 127.0.0.1 >nul
start http://127.0.0.1:5173
