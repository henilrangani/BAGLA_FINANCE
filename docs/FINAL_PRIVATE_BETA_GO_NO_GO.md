# Final Private-Beta Go / No-Go (2026-11-07)

**Decision: NO-GO today.** Engineering is ready for a controlled beta. The blockers are the laptop's C: drive, provisioning (★), the restore drill, monitoring, legal review and your approval.

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Is the RC4 checksum verified? | **PASS** | `73785774…c37a53a` matches; zip integrity OK; 278 files |
| 2 | Is the RC4 source verified? | **PASS** | Byte-identical to `bd584b9`; CI green; local-toolchain clean extraction passed 24 journeys and restart persistence. RC5 (today's safety fixes) is built from a CI-green commit |
| 3 | Does the RC4 Docker installation pass? | **BLOCKED** | C: has 0.04 GB free; Docker CLI hangs. The rc1 Docker path passed earlier with the same compose design |
| 4 | Is Windows storage safe? | **FAIL** | C: 0.04 GB. Windows Update downloads 10.44 GB; needs founder Disk Cleanup (`STORAGE_CLEANUP_REPORT.md`) |
| 5 | Are all protected databases healthy? | **NOT TESTED** (today) | Docker unusable. Last verified unchanged at the end of the overnight session; nothing has run against them since |
| 6 | Are the legacy containers secured? | **FOUNDER APPROVAL REQUIRED** | Plan and rollback: `docs/SECURITY_FINAL_REVIEW.md`. The quickest safe option is `docker stop` (volumes kept) |
| 7 | Is hosting approved and configured? | **FOUNDER APPROVAL REQUIRED** | Costed from official pages: ≈ $30.50/mo + 18% GST (`docs/DIGITALOCEAN_DEPLOYMENT_PLAN.md`); spec prepared (`deploy/digitalocean/app.yaml`) |
| 8 | Is the new beta database ready? | **FOUNDER APPROVAL REQUIRED** | Plan: `docs/BETA_DATABASE_READINESS.md`; migrations and SSL handling verified |
| 9 | Has restore testing passed? | **NOT TESTED** | Managed: no cluster. Local `restore.ps1`: Docker unavailable |
| 10 | Is monitoring configured? | **FOUNDER APPROVAL REQUIRED** | `/health`, `/health/jobs` and request IDs exist; an uptime monitor and alerts must be chosen |
| 11 | Are reminders operational? | **PASS** (local and tests) / **NOT TESTED** (hosted) | Single-run lock, leased delivery, no duplicates (`test_reminders.py`); cron job prepared |
| 12 | Has legal review happened? | **FOUNDER APPROVAL REQUIRED** | Pack ready: `docs/LEGAL_AND_PROVIDERS_PACK.md` |
| 13 | Is a private beta safe to begin? | **BLOCKED** | Needs items 4, 7, 8, 9, 10 and 12 |
| 14 | What remains before public production? | see below | |

## Shortest path to a 20-person private beta
| Step | Who | Time |
|---|---|---|
| 1. Disk Cleanup (Windows Update Cleanup); optionally move Docker's disk to D: | Founder | 15–30 min |
| 2. Re-verify the protected DBs, run the RC5 Docker install test, run `restore.ps1` locally; legacy lockdown if approved | Engineering | ~2 h |
| 3. Approve DigitalOcean; create the BLR1 cluster and the app from `app.yaml`; set secrets | Founder + engineering | ~2 h |
| 4. Restore drill on the managed DB; record the RTO | Engineering | ~1 h |
| 5. Uptime monitor on `/health` and `/health/jobs`; DO alerts | Engineering | ~30 min |
| 6. Counsel reviews the privacy notice and terms; grievance contact | Founder + counsel | external (days) |
| 7. Merge to main, deploy, smoke test, send invitations | Founder approval | ~1 h |

**Engineering effort: about 1 day once C: is fixed and hosting is approved. The calendar time is set by legal review.**

## Before public production
- An external penetration test.
- An email provider: password reset, email verification, email reminders.
- MFA.
- A shared rate-limit store before running more than one API instance.
- High-availability database (Advanced edition), or an accepted single-node risk.
- A screen-reader accessibility pass.
- Automated weekly restore verification.
- Error tracking with PII scrubbing.
- Final legal documents (DPDP).
- Real-phone and Safari tests.
- Production monitoring dashboards and on-call.
