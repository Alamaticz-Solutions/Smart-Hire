# wait_servers.ps1
# Helper script to wait for backend and frontend to be fully ready

$backendReady = $false
$frontendReady = $false
$timeout = 120 # 2 minutes max
$elapsed = 0

Write-Host "================================================" -ForegroundColor Cyan
Write-Host " Waiting for backend (8000) & frontend (5173)..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

while (-not ($backendReady -and $frontendReady) -and ($elapsed -lt $timeout)) {
    if (-not $backendReady) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                $backendReady = $true
                Write-Host "[OK] Backend is ready and listening on port 8000." -ForegroundColor Green
            }
        } catch {
            # Not ready yet
        }
    }
    
    if (-not $frontendReady) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $connect = $tcp.BeginConnect("127.0.0.1", 5173, $null, $null)
            $success = $connect.AsyncWaitHandle.WaitOne(500)
            if ($success) {
                $tcp.EndConnect($connect)
                $frontendReady = $true
                Write-Host "[OK] Frontend is ready and listening on port 5173." -ForegroundColor Green
            }
            $tcp.Dispose()
        } catch {
            # Not ready yet
        }
    }
    
    if (-not ($backendReady -and $frontendReady)) {
        Start-Sleep -Seconds 2
        $elapsed += 2
    }
}

if ($backendReady -and $frontendReady) {
    Write-Host "================================================" -ForegroundColor Green
    Write-Host " All services are online! Launching application..." -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    exit 0
} else {
    Write-Host "================================================" -ForegroundColor Red
    Write-Host " Timeout waiting for services to start." -ForegroundColor Red
    Write-Host "================================================" -ForegroundColor Red
    exit 1
}
