# Release Test Report

## RC4 (overnight, 2026-11-07): `BAGLA_FINANCE_BETA_RELEASE_CANDIDATE_RC4.zip`
Source: branch `phase-1-security-money`; see `BUILD_INFO.txt` for the exact commit.

**Release labels:**
- **BUILD PASS** ✅
- **LOCAL STARTUP PASS** ✅ local toolchain (API with uvicorn, web with a Vite production build). The Docker stack wasn't rebuilt (C: low on space; see below).
- **FUNCTIONAL SMOKE TEST PASS** ✅
- **CLEAN PACKAGE EXTRACTION PASS** ✅ local toolchain, fresh database.
- **PRIVATE BETA READY** ❌ (hosting, managed DB and restore drill, monitoring, legal review, approvals).
- **PUBLIC PRODUCTION READY** ❌

### Working tree
| Suite | Result |
|---|---|
| Backend, SQLite (`pytest -q`) | **121 passed**, 1 skipped (PostgreSQL-only lock test) |
| Backend, PostgreSQL 16 (throwaway, tmpfs) | **122 passed** |
| Migrations up → down (base) → up | head `0010_group_types_split_methods`; `alembic check`: no differences |
| `ruff check app migrations tests` | pass |
| Frontend unit (Vitest) | **137 passed** (16 files) |
| `tsc --noEmit` / `vite build` / `npm audit --omit=dev` | 0 errors / pass / 0 vulnerabilities |
| Browser E2E, 5 projects (Chromium desktop and mobile, Firefox, WebKit, iPhone 13) against a production build | **112 passed** |
| GitHub CI (frontend, backend on SQLite + PostgreSQL + migrations, E2E on PostgreSQL) | **success** on `206d0a4` |

### Clean extraction (the release archive itself)
1. Archive extracted to an empty folder on D:: 277 files, no `node_modules`, `.venv`, `.env.release` or `.git`.
2. `npm ci` and a new Python venv with `requirements-dev.txt`, installed **in the extracted folder on D:**, with caches and temp on D:. C: free space didn't change.
3. In the extracted package:
   - `tsc` 0 errors; `vite build` pass.
   - 137 unit tests passed.
   - 121 backend tests passed, 1 skipped.
4. A new throwaway PostgreSQL 16 (tmpfs, container `bagla_overnight_pg_2`): migrated to `0010`, 0 users at start.
5. Browser journeys from the extracted package against that DB, Chromium desktop and mobile: **24 passed**:
   - sign-up, sign-in and export
   - entries
   - groups, flexible splits and templates
   - analytics reports and CSV
   - navigation and cancel
   - bill scanning
   - recurring bills
   - phone layout
6. API restart: an entry (₹123.45) and the balance were identical after stopping and starting the extracted API; sign-in still worked.
7. The throwaway DB was stopped and removed. The release stack and legacy databases weren't touched (checksums verified before and after).

**Not tested:** `start.ps1` (Docker Compose) from the extracted RC4. Rebuilding the images would grow Docker's disk on C:, which has about 2 GB free. The compose files are unchanged since rc1, where the Docker path, the stop/start persistence on a Docker volume and `backup.ps1` were verified. To run it: free C: space first (`docs/DOCKER_DISK_RECLAIM_FOR_FOUNDER.md`).

### Defects found and fixed overnight
1. Analytics period filter counted the 1st of a month in the previous month west of UTC.
2. Simultaneous retries with the same Idempotency-Key returned HTTP 500 to all but one request. No duplicate was ever saved.
3. Two simultaneous refunds could exceed the original amount where row locks are unavailable (SQLite). PostgreSQL was already safe.

### Added overnight
- Analytics spending reports with CSV export.
- Group expense templates and the monthly summary.
- Tests:
  - the founder's split examples
  - groups of 2, 4, 6, 10 and 50 people
  - simultaneous paybacks
  - the bank Balance column ignored
  - cancelled imports
  - expired family invites
  - concurrent retries and refunds

---

## rc1: Beta Release Candidate (2026-11-06)


Windows 11, Docker Desktop (WSL 2), Node 22 / Python 3.13 / PostgreSQL 16. Every number below comes from a run on 2026-11-06. Source: branch `phase-1-security-money`; see `BUILD_INFO.txt` for the exact commit.

## Release labels
| Label | Status |
|---|---|
| BUILD PASS | ✅ Production web build, both Docker images, TypeScript 0 errors |
| LOCAL STARTUP PASS | ✅ `start.ps1` from the working copy and from a fresh extraction of the ZIP |
| FUNCTIONAL SMOKE TEST PASS | ✅ 39 browser tests against the packaged stack; 8 more against the extracted package |
| CLEAN PACKAGE EXTRACTION PASS | ✅ After one packaging fix (below) |
| PRIVATE BETA READY | ❌ Not yet: hosting, managed DB + restore drill, scheduler and monitoring, legal review and approvals are open (`BETA_DEPLOYMENT_CHECKLIST.md`) |
| PUBLIC PRODUCTION READY | ❌ No |

## Automated suites
| Suite | Result |
|---|---|
| Backend on SQLite | **94 passed**, 1 skipped (a PostgreSQL-only lock test) |
| Backend on PostgreSQL 16 (throwaway, in memory) | **95 passed** |
| Migrations up → down → up on PostgreSQL | PASS, head `0009_job_runs`; `alembic check`: no drift |
| Frontend unit (Vitest) | **99 passed** |
| TypeScript (`tsc --noEmit`) | 0 errors |
| Production build (`vite build`) | PASS (one large-chunk warning, known) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Browser E2E, dev harness (`npm run e2e`, Chromium desktop + Pixel 7) | **20 passed** |

Backend coverage includes auth (cookie, CSRF, rotation, lockout, rate limits), money integrity (paise, transfers not counted as income/expense, capped and traceable refunds), group settlements and refunds with share-ledger invariants (randomised), imports (CSV/XLSX), export, isolation between accounts, reminders and the scheduler lock.

## Against the packaged release stack (`compose.release.yaml`, http://127.0.0.1:8080)
Production settings (`ENVIRONMENT=staging`: Secure cookie, 20 sign-ins per 15 minutes, no `/docs`), through the nginx gateway. Specs run in batches, with an API restart between batches to reset the in-memory sign-in counter.

| Browser | Specs | Result |
|---|---|---|
| Chromium desktop | auth (incl. export download), money, groups, recurring, family, group edit/undo, screens (axe light + dark, keyboard, simulation label), resilience (offline, expired session, legacy token) | **19/19** |
| Firefox desktop | same set except the simulation-label test | **18/18** |
| Android mobile (Pixel 7) | bottom bar / More drawer; no horizontal scroll at 360 px | **2/2** |

Checked directly:
- `/health` → `{"status":"ok"}`.
- `/health/jobs` → 200 with `healthy:true` once the scheduler had run.
- The app sends the CSP `connect-src 'self'` and `X-Frame-Options: DENY`.
- DB: `bagla_beta_rc` at `0009_job_runs`; port **not published**; app bound to `127.0.0.1:8080` only.
- Demo seed: exact balances (₹1,10,600.50 and ₹4,540.00 from the scripted entries, including a transfer).
- **Restart and persistence:** full stop, then start: 44 users, 42 entries and the net paise total identical before and after.

## Clean extraction test (the ZIP itself)
1. Extracted the ZIP into an empty folder and checked it: 249 files, no `.env.release`, no `node_modules`, venvs, caches, `.git`, databases or dumps.
2. **First attempt FAILED.** The web image copied `.npmrc`, a machine-local npm cache setting that isn't (and shouldn't be) in the package. Fixed by not copying it, then repackaged.
3. Second attempt, a fresh extraction run as a separate project (`bagla_rcx`, new volume `bagla_rcx_pgdata`):
   - `start.ps1` generated new secrets, built, migrated to `0009` and started all 5 containers.
   - Database fresh (0 users), `/health` ok, `/health/jobs` 200.
   - `seed_demo.py` balances exact.
   - Browser: **8/8** (Chromium: auth incl. export, money, groups, recurring).
   - `stop.ps1` then `start.ps1`: data identical (10 users, 18 entries, same net paise).
   - `backup.ps1`: 112 KB dump; its SHA-256 matches the `.sha256` file.

## Defects found and fixed in this sprint
1. **Sign-in lockout from page reloads.** Session refresh shared the 20-per-15-minutes sign-in bucket per IP, so about 20 page loads from one household or office IP blocked everyone's sign-in and refresh. Refresh now has its own bucket (120, capped at 300 in production). Tests cover both directions.
2. **Fake integration screen.** The payment sync demo showed GPay/PhonePe/Paytm "Listening", "Live Active" and Account Aggregator "Synced". It's now labelled a simulation with an explicit "nothing is connected" note, and simulated entries are marked "(simulated)". Regression test added.
3. **Demo data with personal details.** The founder's name and surname appeared, and real-format UPI IDs and phone numbers could belong to real people (a demo "pay" tap could open a payment to a stranger). Removed.
4. **No in-app full export.** Added *Account & Sync → Download my account data* (the server's full export), with an E2E test.
5. **Packaging:** the dependency on `.npmrc` (see above).
6. Test harness: four specs hardcoded the dev API port; they now use the shared setting.

## Legacy database
`bagla_finance_python_ready-postgres-1` was not modified. It's still at revision `0001`, and the per-table checksums at the end of the sprint equal the 2026-11-06 audit:
- users `4ccce718…`
- financial_accounts `50844d05…`
- transactions `cf2465a5…`

The release stack never connects to it. It still listens on `0.0.0.0:5432` with the default password, and its Redis on `0.0.0.0:6379` (★ founder decision).

## Not tested
- Safari/WebKit against the local package. The `Secure` cookie isn't kept over plain http there, by design; the dev-harness WebKit run (55/55 earlier today) used a non-Secure test cookie. Real Safari on macOS/iOS and real phones are untested.
- Screen readers (NVDA, TalkBack, VoiceOver).
- Live Gemini AI (no key). Email delivery (no provider). Any hosted environment, HTTPS, managed PostgreSQL, point-in-time recovery.
- Load against the packaged stack. The 25-user load test from earlier today ran on the dev setup.
- A Windows machine other than this one. The extraction test ran on the same PC, so Docker base images and layers were already cached; a first build elsewhere downloads them (internet needed, about 3 GB of disk).
