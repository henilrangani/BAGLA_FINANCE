# Security Checklist

Status as of 2026-11-04. ✅ implemented and tested · 🟡 implemented, not fully verified · ⬜ planned. Nothing here is a compliance certification.

## Authentication and sessions (backend)
- ✅ Argon2id password hashing (pwdlib); minimum 12 characters
- ✅ JWT access tokens (15 min, HS256, `type`/`sid` checked); a secret under 32 characters or a known placeholder is refused at startup
- ✅ Opaque refresh tokens, stored only as SHA-256, rotated on every use; reuse revokes all sessions
- ✅ Logout, logout-all and password change take effect immediately (session checked on each request)
- ✅ Lockout after 5 failures (15 min); per-IP limit on auth routes; same response for an unknown email or a wrong password; timing equalized
- 🟡 Per-IP limiter is in-memory, per process → move to Redis or Postgres before running more than one instance
- ⬜ Email verification, password reset, MFA (needs an email or SMS provider: founder decision)

## Authorization and data
- ✅ Every query scoped to the authenticated user; cross-user access returns 404 (tested for reads and writes)
- ⬜ PostgreSQL row-level security as a second layer
- ✅ Strict integer-paise validation; database CHECK constraints on amounts, kinds and statuses
- ✅ Idempotency keys (unique constraint) prevent duplicate posting
- ✅ Append-only audit trail; void instead of delete
- ✅ Data export (`/users/me/export`) and self-service deletion (password + typed confirmation)
- ⬜ Encryption at rest: rely on the managed database's disk encryption (verify with the chosen host); field-level encryption not planned yet
- ⬜ Backups and point-in-time recovery: depends on the host; restore drill not done

## HTTP
- ✅ CORS allowlist (no wildcard); security headers; 1 MB body limit (Content-Length based); no-store caching
- ✅ API docs disabled in staging and production
- 🟡 TLS: must be terminated by the host; HSTS is sent when `ENVIRONMENT` is staging or production
- 🟡 Chunked requests without Content-Length bypass the size check; rely on the reverse proxy's limit

## Frontend and Node layer (Phase 1)
- ✅ No master PIN; PBKDF2 PIN hash (a privacy screen, **not** account security)
- ✅ Signed webhook (HMAC, replay protection) disabled without a secret
- ✅ AI routes: validation, limits, timeouts, prompt-injection mitigation, output re-validation
- 🟡 In-memory rate limits on Vercel are per instance
- ⬜ Move auth to the backend (Phase 3); local data stays unencrypted until then

## Never stored or requested
UPI PIN · OTP · CVV · bank passwords · private keys. None of the code paths accept them.

## For qualified legal review (not done)
- DPDP Act 2023: notice, consent, purpose limitation, data-principal rights (export and deletion exist), breach notification, retention policy, processor agreements (Google Gemini, hosting)
- RBI/NPCI: confirm the product stays record-keeping only; Account Aggregator access only via a licensed AA and the FIU route
- Google Play policy for any future notification-listener app
- Terms of service, privacy policy, grievance officer

## Added 2026-11-06
- [x] Refresh token in an HttpOnly cookie; CSRF header + Origin check; atomic rotation
- [x] Route-wide authentication sweep test; cross-account id probes
- [x] CSV export formula-injection guard
- [x] Export covers all personal data categories; deletion keeps shared spaces for others
- [ ] Same-origin `/api/v1` rewrite configured on the chosen host (deployment ★)
- [ ] Shared rate-limit store before running more than one API instance
- [ ] External penetration test before public launch
