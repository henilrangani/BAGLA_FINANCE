# Creates one synthetic demo account with sample entries (invented data only).
# Prints the demo e-mail and a random password once; nothing is stored.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
docker compose -f compose.release.yaml --env-file .env.release exec api python scripts/seed_demo.py
