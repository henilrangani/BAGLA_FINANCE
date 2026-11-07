# DigitalOcean Deployment Plan (private beta)

Prices and features were read from DigitalOcean's official pages on **2026-11-07**:
- [App Platform pricing](https://www.digitalocean.com/pricing/app-platform) and [docs pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/)
- [Managed DB pricing](https://www.digitalocean.com/pricing/managed-databases) and [PostgreSQL docs pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/)
- [PostgreSQL features](https://docs.digitalocean.com/products/databases/postgresql/details/features/)
- [Regional availability](https://docs.digitalocean.com/platform/regional-availability/)
- [India tax](https://docs.digitalocean.com/platform/billing/taxes/ind/)
- [Scheduled jobs](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/)
- [Routing rules](https://docs.digitalocean.com/products/app-platform/how-to/url-rewrites/)
- [DB plan changes](https://docs.digitalocean.com/release-notes/upcoming/dbaas-plan-changes/)

Re-check the prices on the day of purchase. **Nothing has been purchased or provisioned.**

## Recommendation
**DigitalOcean, Bangalore.** App Platform for the web and API, plus Managed PostgreSQL in BLR1.
- **Region:** both are available in Bangalore, so data stays in India.
- **One origin:** routing rules send `/api/v1` to the API and `/` to the web app on one domain, which the cookie and CSP design require.
- **Jobs:** scheduled jobs (15-minute minimum) match the reminder job.
- **Backups:** daily backups with 7-day point-in-time recovery are included.

No alternative was found that is materially better for this beta.

## Services (`deploy/digitalocean/app.yaml`, prepared, not applied)
| Component | Size | $/month | Notes |
|---|---|---|---|
| `api` (FastAPI) | `apps-s-1vcpu-1gb-fixed` | 10.00 | 1 GiB for Argon2 hashing; 1 instance (in-memory rate limits) |
| `web` (Node: static app + AI routes) | `apps-s-1vcpu-0.5gb` | 5.00 | Could become a static site later |
| `migrate` job | PRE_DEPLOY | ≈ 0 | Runs only during deploys |
| `reminders` job | SCHEDULED `*/15` (Asia/Kolkata) | ≈ 0.35 | Billed per second while running, 1-minute minimum: 96 runs/day ≈ 48 h/month at the $5 rate |
| Managed PostgreSQL 16 | Standard, 1 vCPU / 1 GiB, 10 GiB, single node, BLR1 | 15.15 | Daily backups and 7-day PITR included |
| Bandwidth | pooled allowance (50 + 100 GiB from the two services) | 0 | Overage $0.02/GiB; a 20-person beta uses well under 5 GiB |

| | USD/month |
|---|---|
| **Subtotal** | **≈ 30.50** |
| GST 18% (if no GSTIN on the account; with a GSTIN, reverse charge applies) | ≈ 5.49 |
| **Total** | **≈ 36** (≈ ₹3,000 at ₹84/USD; billed in USD) |

**Not included:**
- The domain name.
- Optional error tracking (free tiers exist).
- The one-off restore-drill cluster: about $0.03 for an hour of a $15 cluster.

**Database plan constraint:** from 30 Nov 2026 (and already for accounts that never created a cluster), new **Standard** clusters can't add standby nodes. High availability then means Advanced edition, from $130/month. For a 20-person beta, a single node with PITR is the proportionate choice; revisit before public launch.

## Environment variables
| Key | Where | Value |
|---|---|---|
| `ENVIRONMENT` | api, jobs | `production` (forces Secure cookies, the strict rate limit, no `/docs`) |
| `DATABASE_URL` | api, jobs | `${bagla-db.DATABASE_URL}` (has `sslmode=require`; the app adapts it per driver; tested) |
| `JWT_SECRET` | api, jobs | **encrypted secret**, 48+ random bytes, generated once |
| `CORS_ORIGINS` | api | `https://<beta domain>` only |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | api | 5 / 5 (keeps under the 1 GiB plan's connection limit) |
| `GEMINI_API_KEY` | web | empty (AI off) unless ★ approved |

## Networking and database access
- The database's **trusted sources** are set to the App Platform app only. There are no public IPs, and the founder's IP is added only temporarily for the restore drill.
- TLS is required (`sslmode=require`).
- The app connects as a database user that owns only `bagla_beta` and isn't the `doadmin` superuser.
- HTTPS certificates are managed by App Platform on the custom domain, with HSTS on (production setting).

## Deployment procedure (after ★ approval)
1. ★ Merge `phase-1-security-money` to `main` after review, with CI green.
2. Create the Managed PostgreSQL cluster in BLR1 (Standard, 1 GiB), then the database `bagla_beta` and user `bagla_app`. Restrict trusted sources.
3. `doctl apps create --spec deploy/digitalocean/app.yaml`, then set `JWT_SECRET` and `CORS_ORIGINS` in the panel.
4. The first deploy runs the `migrate` job (`alembic upgrade head` to `0010`). Then verify `GET /health` and `GET /health/jobs` (503 until the first reminder run, then 200).
5. Run the restore drill (`BETA_DATABASE_READINESS.md`) **before** inviting anyone.
6. Smoke test: register, add, edit and void an entry, create a group with a percentage split, settle, export, delete the test account.
7. ★ DNS: point `app.<domain>` at the app.

## Rollback
- **Code:** App Platform keeps previous deployments; roll back from the Activity tab. Migrations are additive, so older code runs on the newer schema.
- **Data:** PITR restores to a new cluster (see `DISASTER_RECOVERY_PLAN.md`). The live cluster is never overwritten.

## Monitoring
- **App Platform alerts:** deployment failed, domain failed, plus CPU and memory.
- **External uptime checks:**
  - `/health` every minute.
  - `/health/jobs` every 15 minutes (it alerts if no reminder run succeeded in 45 minutes).
- **Database alerts:** CPU, disk over 80%, connection count.

## Scaling (later)
1. Give the API 2 GiB before adding instances.
2. Before running more than one API instance, move rate limits to a shared store.
3. Database: grow within Standard up to 4 GiB; Advanced edition for standby or replicas.
