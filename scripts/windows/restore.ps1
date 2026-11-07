# Restores a backup made by backup.ps1 into a NEW, separate database, for checking a backup.
# It never touches the live database (POSTGRES_DB in .env.release) and refuses a target that exists.
# Usage (from the package folder):
#   powershell -ExecutionPolicy Bypass -File scripts\windows\restore.ps1 -Dump backups\bagla_rc_2026-11-06_1603.dump [-Target bagla_restore_check]
# Afterwards it prints row counts and money totals for the live and restored databases, side by side.
# Switching the app to a restored database is a deliberate, manual step (see DISASTER_RECOVERY_PLAN.md).
param(
  [Parameter(Mandatory = $true)][string]$Dump,
  [string]$Target = ("bagla_restore_" + (Get-Date -Format "yyyyMMdd_HHmm"))
)
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$compose = @("-f", "compose.release.yaml", "--env-file", ".env.release")

if (-not (Test-Path $Dump)) { Write-Error "Dump not found: $Dump"; exit 1 }
if ($Target -notmatch '^[a-z][a-z0-9_]{2,62}$') { Write-Error "Target must be lowercase letters, digits and _ (3-63 chars)."; exit 1 }
$live = ((Get-Content .env.release | Where-Object { $_ -match '^POSTGRES_DB=' }) -replace 'POSTGRES_DB=', '')
if (-not $live) { $live = "bagla_beta_rc" }
if ($Target -eq $live) { Write-Error "Refusing: '$Target' is the live database."; exit 1 }

# Verify the checksum file if present.
if (Test-Path "$Dump.sha256") {
  $expected = ((Get-Content "$Dump.sha256" -Raw).Trim() -split "\s+")[0]
  $actual = (Get-FileHash $Dump -Algorithm SHA256).Hash
  if ($expected -ne $actual) { Write-Error "SHA-256 mismatch: the dump may be damaged. Not restoring."; exit 1 }
  Write-Host "Checksum OK."
} else { Write-Warning "No .sha256 file next to the dump; integrity not verified." }

$exists = docker compose @compose exec -T db sh -c "psql -U `"`$POSTGRES_USER`" -d postgres -Atc `"select 1 from pg_database where datname='$Target'`""
if ($exists -match "1") { Write-Error "Refusing: database '$Target' already exists. Choose another -Target."; exit 1 }

$inside = "/tmp/restore_" + [IO.Path]::GetFileName($Dump)
$id = (docker compose @compose ps -q db)
docker cp $Dump "${id}:$inside"
docker compose @compose exec -T db sh -c "createdb -U `"`$POSTGRES_USER`" $Target && pg_restore -U `"`$POSTGRES_USER`" --no-owner --exit-on-error -d $Target $inside"
$rc = $LASTEXITCODE
docker compose @compose exec -T db rm -f $inside
if ($rc -ne 0) { Write-Error "Restore failed. The live database was not touched. The partial '$Target' can be dropped after review."; exit 1 }

$q = "select (select version_num from alembic_version) as revision, (select count(*) from users) as users, (select count(*) from transactions) as entries, (select coalesce(sum(case when direction='credit' then amount_paise else -amount_paise end),0) from transactions where status='posted') as net_paise, (select count(*) from split_expenses) as group_expenses, (select count(*) from audit_events) as audit_events"
foreach ($dbn in @($live, $Target)) {
  Write-Host "--- $dbn"
  docker compose @compose exec -T db sh -c "psql -U `"`$POSTGRES_USER`" -d $dbn -c `"$q`""
}
Write-Host "Restored into '$Target'. The live database '$live' was not changed."
Write-Host "Counts can differ if entries were added after the backup was taken."
