# Stops the BAGLA FINANCE release stack. Your data stays in the Docker volume bagla_rc_pgdata.
# This script never deletes volumes. Do not run "docker compose down -v": it erases all data.
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
docker compose -f compose.release.yaml --env-file .env.release stop
Write-Host "Stopped. Start again with scripts\windows\start.ps1 (data is kept)."
