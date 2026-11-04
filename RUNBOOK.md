# Runbook

## Local development (Windows / PowerShell or Git Bash)
```bash
npm ci                 # installs exactly what package-lock.json lists
copy .env.example .env # then fill in values locally; never commit .env
npm run dev            # http://127.0.0.1:3000
```

## Checks before every commit
```bash
npm run lint   # TypeScript
npm test       # Vitest unit tests
npm run build  # production bundle
```

## Backend (FastAPI)
See `backend/README.md`. Quick version: `cd backend`, create `.venv`, `pip install -r requirements-dev.txt`, copy `.env.example` to `.env` (set `JWT_SECRET`), `docker compose up -d`, `alembic upgrade head`, `uvicorn app.main:app --reload --port 8000`.

### Incident: suspected token theft
Rotate `JWT_SECRET` in the host's secret store and redeploy. This invalidates every access token; refresh sessions remain, so also revoke all of them in SQL:
`UPDATE auth_sessions SET revoked_at = now() WHERE revoked_at IS NULL;` (forces everyone to sign in again).

## Environment variables
See `.env.example`. All of them are server-only; none use the `VITE_` prefix, so none reach the browser.
- `GEMINI_API_KEY`: optional. Without it the AI routes return deterministic fallbacks.
- `GEMINI_MODEL`: check that the model exists, and what it costs, before deploying.
- `WEBHOOK_SECRET`: when it's empty the webhook endpoint returns 503.

## Sending a test webhook (local)
```bash
BODY='{"amount":"250.50","referenceId":"test-1","provider":"UPI"}'
T=$(date +%s)
SIG=$(printf '%s' "$T.$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $NF}')
curl -X POST http://127.0.0.1:3000/api/webhooks/payment-sync \
  -H 'Content-Type: application/json' -H "X-Bagla-Signature: t=$T,v1=$SIG" -d "$BODY"
```

## Deployment
Not done in Phase 1. Don't deploy to production without founder approval. Use a Vercel **preview** deployment first, and verify the webhook and the AI routes there.

## Incident: a leaked API key
1. Revoke the key in Google AI Studio and create a new one.
2. Update it in Vercel → Project → Settings → Environment Variables, then redeploy.
3. Check Gemini usage for abuse.
