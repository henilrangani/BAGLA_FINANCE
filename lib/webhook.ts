/**
 * Payment-sync webhook verification.
 *
 * Previously /api/webhooks/payment-sync accepted and logged any payload with
 * no authentication at all. Now:
 * - If WEBHOOK_SECRET is not set the endpoint is DISABLED (503).
 * - Requests must carry `X-Bagla-Signature: t=<unix seconds>,v1=<hex>` where
 *   v1 = HMAC-SHA256(secret, `${t}.${rawBody}`), compared in constant time.
 * - Timestamps older/newer than 5 minutes are rejected (replay window), and a
 *   signature can be used once (in-memory replay cache; per-instance only —
 *   move to Redis before relying on it across serverless instances).
 * - Payloads are validated; full payloads are never logged.
 *
 * NOTE: nothing is stored server-side yet (there is no database). A verified
 * event is acknowledged but not ingested into anyone's ledger.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseRupeeInput } from "../src/utils/money";

export const SIGNATURE_HEADER = "x-bagla-signature";
export const TOLERANCE_SECONDS = 300;
export const MAX_WEBHOOK_BYTES = 64 * 1024;

export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export type VerifyResult = { ok: true; timestamp: number } | { ok: false; status: number; error: string };

const seen = new Map<string, number>(); // signature -> expiry (ms)

function remember(sig: string, now: number): boolean {
  for (const [k, exp] of seen) if (exp <= now) seen.delete(k);
  if (seen.has(sig)) return false;
  if (seen.size > 50_000) seen.clear();
  seen.set(sig, now + TOLERANCE_SECONDS * 2 * 1000);
  return true;
}

export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | undefined,
  nowMs = Date.now()
): VerifyResult {
  if (!secret) return { ok: false, status: 503, error: "Webhook endpoint is disabled (WEBHOOK_SECRET not configured)" };
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return { ok: false, status: 413, error: "Payload too large" };
  if (!signatureHeader) return { ok: false, status: 401, error: "Missing signature" };

  const parts = Object.fromEntries(
    signatureHeader.split(",").map(p => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = Number(parts.t);
  const v1 = parts.v1 || "";
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/i.test(v1)) return { ok: false, status: 401, error: "Malformed signature" };
  if (Math.abs(nowMs / 1000 - t) > TOLERANCE_SECONDS) return { ok: false, status: 401, error: "Signature timestamp outside tolerance" };

  const expected = Buffer.from(signPayload(secret, t, rawBody), "hex");
  const given = Buffer.from(v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }
  if (!remember(v1.toLowerCase(), nowMs)) return { ok: false, status: 409, error: "Replay detected" };
  return { ok: true, timestamp: t };
}

export function validatePaymentEvent(raw: string):
  | { ok: true; event: { provider: string; amount: number; merchant: string; referenceId: string } }
  | { ok: false; error: string } {
  let p: any;
  try {
    p = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Body must be JSON" };
  }
  const amount = parseRupeeInput(String(p?.amount ?? ""));
  if (amount.ok === false) return { ok: false, error: `Invalid amount: ${amount.error}` };
  const referenceId = typeof p?.referenceId === "string" ? p.referenceId.slice(0, 64) : "";
  if (!referenceId) return { ok: false, error: "referenceId is required (used for idempotency)" };
  return {
    ok: true,
    event: {
      provider: typeof p?.provider === "string" ? p.provider.slice(0, 32) : "unknown",
      amount: amount.rupees,
      merchant: typeof p?.merchant === "string" ? p.merchant.slice(0, 80) : "",
      referenceId,
    },
  };
}

/** Full handler shared by Express and Vercel. Takes the exact raw body bytes. */
export function handlePaymentWebhook(rawBody: string, signatureHeader: string | undefined, secret = process.env.WEBHOOK_SECRET) {
  const v = verifyWebhook(rawBody, signatureHeader, secret);
  if (v.ok === false) return { status: v.status, body: { error: v.error } };
  const e = validatePaymentEvent(rawBody);
  if (e.ok === false) return { status: 400, body: { error: e.error } };
  console.log(`[webhook] verified event ref=${e.event.referenceId} provider=${e.event.provider}`);
  return {
    status: 200,
    body: {
      success: true,
      status: "verified_not_stored",
      message: "Signature verified. Server-side ingestion is not implemented yet (no database).",
      referenceId: e.event.referenceId,
    },
  };
}
