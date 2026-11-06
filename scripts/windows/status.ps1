# Shows container health and the app's health endpoints.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
docker compose -f compose.release.yaml --env-file .env.release ps
$port = ((Get-Content .env.release | Where-Object { $_ -match '^APP_PORT=' }) -replace 'APP_PORT=', '')
if (-not $port) { $port = "8080" }
try { Write-Host ("/health: " + ((Invoke-RestMethod "http://localhost:$port/health") | ConvertTo-Json -Compress)) } catch { Write-Host "/health: not reachable" }
try { Write-Host ("/health/jobs: " + ((Invoke-WebRequest "http://localhost:$port/health/jobs" -UseBasicParsing).Content)) } catch { Write-Host "/health/jobs: $($_.Exception.Message) (503 until the reminder job has run once)" }
