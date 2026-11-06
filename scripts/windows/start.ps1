# Starts the BAGLA FINANCE release stack with Docker Desktop.
# First run: creates .env.release with random secrets (if missing), builds the images,
# creates the NEW database volume bagla_rc_pgdata, runs migrations and starts the app.
# Run from the package folder:  powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Error "Docker is not running. Start Docker Desktop and try again."; exit 1 }

$envFile = Join-Path $root ".env.release"
if (-not (Test-Path $envFile)) {
    function New-Secret([int]$bytes) {
        $b = New-Object byte[] $bytes
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
        return ([Convert]::ToBase64String($b) -replace '[+/=]', '')
    }
    $text = (Get-Content (Join-Path $root ".env.release.example") -Raw)
    $text = $text -replace '(?m)^POSTGRES_PASSWORD=$', ("POSTGRES_PASSWORD=" + (New-Secret 24))
    $text = $text -replace '(?m)^JWT_SECRET=$', ("JWT_SECRET=" + (New-Secret 48))
    [System.IO.File]::WriteAllText($envFile, $text)
    Write-Host "Created .env.release with new random secrets (keep this file private)."
}

docker compose -f compose.release.yaml --env-file .env.release up -d --build
if ($LASTEXITCODE -ne 0) { Write-Error "Startup failed. See: docker compose -f compose.release.yaml --env-file .env.release logs"; exit 1 }

$port = ((Get-Content $envFile | Where-Object { $_ -match '^APP_PORT=' }) -replace 'APP_PORT=', '')
if (-not $port) { $port = "8080" }
$url = "http://localhost:$port"
for ($i = 0; $i -lt 30; $i++) {
    try { $h = Invoke-RestMethod "$url/health" -TimeoutSec 3; if ($h.status -eq "ok") { break } } catch { Start-Sleep 2 }
}
Write-Host ""
Write-Host "BAGLA FINANCE is running: $url"
Write-Host "Health check: $url/health"
Write-Host "Stop (keeps data): powershell -ExecutionPolicy Bypass -File scripts\windows\stop.ps1"
