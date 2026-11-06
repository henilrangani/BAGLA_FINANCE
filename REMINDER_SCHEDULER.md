# Reminder Scheduler: Deployment and Monitoring

**Code status: implemented and tested** (`backend/app/jobs/reminders.py`, `services/reminders.py`, migration 0009). **Production scheduling: not configured** (no host yet).

## What one run does
1. Takes a PostgreSQL advisory lock. If another run holds it, it records `skipped` and exits 0.
2. Queues reminders for every active bill of every opted-in user. "Today" is computed in **each user's own timezone**. Each item is unique per (user, channel, bill, due date), so repeats never duplicate.
3. Delivers due items. Each row is claimed with a conditional lease update before it's handed to a channel, so concurrent workers never deliver the same item (tested with 3 parallel workers).
   - In-app items become `delivered`.
   - Email items become `skipped: no email provider configured`, **never `delivered`**.
   - With a real provider, failures retry with exponential backoff (2, 4, 8, 16 min) and become `failed` after 5 attempts.
4. Respects quiet hours (local time): delivery waits until they end; nothing is dropped. `bill_reminders=false` stops new reminders.
5. Records the run in `job_runs` (`ok` / `error` / `skipped`, with counts) and exits 1 on failure.

## Deploy (recommended host, see HOSTING_OPTIONS.md)
- DigitalOcean App Platform: add a **Scheduled Job** component from the same image, cron `*/15 * * * *` (UTC), command `python -m app.jobs.reminders`, with the same env vars as the API.
- Render: a Cron Job service with the same schedule and command.
- Plain VM: a `systemd` timer (`OnCalendar=*:0/15`) or a crontab line. Never run it from a web worker.

## Monitor
- Poll `GET /health/jobs` every 5 min. It returns **503** when there has been no successful run in 45 minutes (three missed runs). Alert on 503.
- Alert on a non-zero exit code from the scheduled job (platform job-failure alerts).
- Weekly: count `notifications` with `status='pending' AND next_attempt_at < now() - interval '1 hour'`. It should be 0.

## Verified (2026-11-06)
- Backend tests (SQLite and PostgreSQL 16): idempotent queuing, user timezone, quiet hours, opt-out, paid bills skipped, missed months, retries and backoff, provider never claimed, concurrent delivery exactly once, run log and health staleness, advisory-lock skip (PostgreSQL).
- **Not verified:** a real email provider; a scheduler on a real host.
