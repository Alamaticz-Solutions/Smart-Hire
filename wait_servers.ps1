# wait_servers.ps1
# Helper script to wait for backend and frontend to be fully ready

$backendReady = $false
$frontendReady = $false
$timeout = 120 # 2 minutes max
$elapsed = 0

function Test-Port {
    param (
        [string]$HostName,
        [int]$Port
    )
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $connect = $tcp.BeginConnect($HostName, $Port, $null, $null)
        $success = $connect.AsyncWaitHandle.WaitOne(1000)
        if ($success) {
            $tcp.EndConnect($connect)
            return $true
        }
    } catch {
        # Ignore
    } finally {
        $tcp.Dispose()
    }
    return $false
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host " Waiting for backend (8000) & frontend (5173)..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

while (-not ($backendReady -and $frontendReady) -and ($elapsed -lt $timeout)) {
    if (-not $backendReady) {
        if ((Test-Port "127.0.0.1" 8000) -or (Test-Port "localhost" 8000)) {
            $backendReady = $true
            Write-Host "[OK] Backend is ready and listening on port 8000." -ForegroundColor Green
        }
    }
    
    if (-not $frontendReady) {
        if ((Test-Port "127.0.0.1" 5173) -or (Test-Port "localhost" 5173)) {
            $frontendReady = $true
            Write-Host "[OK] Frontend is ready and listening on port 5173." -ForegroundColor Green
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
