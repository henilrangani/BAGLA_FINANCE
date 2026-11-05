# Next Session: Continuation Point

_Updated 2026-11-05 (Phase 3 integration)._

## Workspace (moved off C:)
- Repo: `D:\BAGLA_FINANCE_WORKSPACE\main-app` (branch `phase-1-security-money`). The old copy at `C:\Users\henil\OneDrive\Desktop\BAGLA_FINANCE_GITHUB_WORK` is stale; don't edit it. The founder decides whether to remove it.
- Before running dev commands: `source /d/BAGLA_FINANCE_WORKSPACE/env.sh` (Bash) or `. D:\BAGLA_FINANCE_WORKSPACE\env.ps1`. This puts TEMP, npm/pip caches, pytest temp and Playwright output on D:.
- Backups: `D:\BAGLA_FINANCE_WORKSPACE\backups\` (repo bundle, Phase 3 snapshot bundle, local ref `refs/backups/phase3-2026-11-05`).
- `CLAUDE_CODE_TMPDIR` is set at Windows user level but **wasn't inherited** by the Claude session (fully quit Claude from the system tray or sign out/in).

## Blocked
- **Docker Desktop unresponsive** (`docker version` times out). Restart Docker Desktop (not reset), then move its disk via Settings → Resources → Advanced → Disk image location → `D:\BAGLA_FINANCE_WORKSPACE\docker-data`. Then re-run the backend suite on PostgreSQL and the migration up/down/up.

## Phase 3: done
Account mode, sync/outbox, migration, Account features (import, family, support, plan), transaction edit + confirmed delete, account name, rule-based coach. All browser-verified (see TEST_REPORT 2026-11-05).

## Do next
1. Confirm CI green for the Phase 3 commit.
2. Re-verify on PostgreSQL once Docker works.
3. Add an automated Playwright suite for the flows verified manually (Playwright browsers → `D:\BAGLA_FINANCE_WORKSPACE\playwright-browsers`).
4. Server models for group splits, recurring bills and the family space (still device-only).
5. Refresh token → httpOnly cookie; i18n (en/hi/gu); Simple/Pro mode; accessibility and performance passes.
