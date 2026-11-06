# Backs up the release database to backups\ with a SHA-256 file. Read-only for the database.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root
New-Item -ItemType Directory -Force (Join-Path $root "backups") | Out-Null
$name = "bagla_rc_" + (Get-Date -Format "yyyy-MM-dd_HHmm") + ".dump"
$inside = "/tmp/$name"
docker compose -f compose.release.yaml --env-file .env.release exec -T db sh -c "pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" --format=custom --no-owner --file=$inside"
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump failed"; exit 1 }
$id = (docker compose -f compose.release.yaml --env-file .env.release ps -q db)
docker cp "${id}:$inside" (Join-Path $root "backups\$name")
docker compose -f compose.release.yaml --env-file .env.release exec -T db rm -f $inside
$hash = (Get-FileHash (Join-Path $root "backups\$name") -Algorithm SHA256).Hash
Set-Content -Path (Join-Path $root "backups\$name.sha256") -Value "$hash  $name" -Encoding ascii
Write-Host "Backup: backups\$name"
Write-Host "SHA-256: $hash"
