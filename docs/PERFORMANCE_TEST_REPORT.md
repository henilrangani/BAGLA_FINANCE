# Performance Test Report: 10 / 20 / 25 / 30 simultaneous users

**Run:** 2026-11-07, 11:26–11:30 IST.
**Machine:** this laptop (Intel Core i5-12450H, 15.7 GB RAM, Windows 11).
**Tool:** `backend/scripts/load_test.py` (raw output in `D:\BAGLA_FINANCE_WORKSPACE\performance-tests\results*.txt`).

## Set-up
- **Server:** an isolated API on port 8200. One uvicorn process, with its own **SQLite** database on D:, created fresh for the run. The demo, release and legacy databases weren't touched.
- **Why SQLite:** Docker and PostgreSQL were unavailable (C: full). Production uses PostgreSQL.
- **What each simulated user does, all at the same time:**
  1. Register and sign in.
  2. Load the dashboard (accounts, monthly summary, recent entries).
  3. Create 10 entries, plus 2 deliberate duplicate retries.
  4. List entries 3 times; run analytics (summary and net worth).
  5. Create a group, add a group expense, record a settlement.
  6. Read back the posted entries.
- **Ledger check:** each user's posted total must equal exactly what that user created.
- **Rate limit:** the sign-in limit was raised for this test only, because all synthetic users come from one IP. Real users each have their own IP.

## Results
### Run 1 (before fix)
| Users | Requests | Errors | Ledger mismatches |
|---|---|---|---|
| 10 | 260 | 0 | 0 |
| 20 | 496 | 3 (0.60%) | 1 |
| 25 | 578 | 6 (1.04%) | 0 |
| 30 | 780 | 2 (0.26%) | 2 |

**Cause:** the logs (by request ID) showed `OperationalError`, which on SQLite means "database is locked". A second writer failed immediately instead of waiting. The mismatches were writes that **returned an error to the client**; no money was silently lost or doubled.

**Fix (commit `8cbb27e`):** SQLite connections now use WAL and a 30 s busy timeout. PostgreSQL is unaffected.

### Run 2 (after fix)
| Users | Requests | Throughput | p50 | p95 | p99 | Max | Errors | Ledger mismatches | Server CPU (avg, 1 core) | Server memory (peak) |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 260 | 68.7 req/s | 66 ms | 507 ms | 1,084 ms | 1.5 s | **0** | **0** | 11% | 157 MB |
| 20 | 520 | 70.8 req/s | 119 ms | 1,069 ms | 2,509 ms | 3.5 s | **0** | **0** | 22% | 164 MB |
| 25 | 650 | 73.7 req/s | 145 ms | 1,228 ms | 2,996 ms | 4.5 s | **0** | **0** | 15% | 167 MB |
| 30 | 780 | 76.2 req/s | 167 ms | 1,123 ms | 3,214 ms | 6.3 s | **0** | **0** | 13% | 170 MB |

**What dominates the slow tail:**
- **Registration and sign-in** use deliberately slow password hashing (Argon2id), at roughly 1.5–2 s p50 under load.
- **Entry creation** waits for SQLite's single writer.

Reads (lists, analytics, dashboard) stay mostly under 0.5 s at p95.

## What this shows, and what it doesn't
- **Shown:** 30 simultaneous users doing write-heavy work on one process on a laptop, with **0 errors and an exact ledger**.
- **Not shown:**
  - Hosted performance (network latency, 1 vCPU containers).
  - PostgreSQL at 30 users today. An earlier PostgreSQL run on 2026-11-06 had 25 users, 925 requests, 0 errors and 0 mismatches.
  - Hours-long load or soak tests.
  - Browser rendering time.
- **CPU and memory:** measured for the server process only. The load generator ran on the same machine.
- **Bottlenecks to address before scaling:** password hashing at sign-in bursts (keep 1 GiB+ RAM; consider a second API instance with a shared rate-limit store), and a PostgreSQL connection pool sized to the plan (done: configurable).

**Claim supported by evidence:** the first version handled **30 simultaneous active users** in a local test with **0 errors and exact financial totals**. Response-time targets on hosted infrastructure must be re-measured after deployment.
