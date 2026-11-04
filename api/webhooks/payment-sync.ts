// Thin Vercel wrapper; verification logic lives in lib/webhook.ts.
import { MAX_WEBHOOK_BYTES, SIGNATURE_HEADER, handlePaymentWebhook } from "../../lib/webhook";
import { LIMITS, clientIp } from "../../lib/security";
import { readRawBody, sendJson } from "../../lib/vercel";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed. Use POST." }, { Allow: "POST" });
  const ip = clientIp(req.headers, req.socket?.remoteAddress, true);
  const wait = LIMITS.webhook.check(`webhook:${ip}`);
  if (wait > 0) return sendJson(res, 429, { error: "Too many requests" }, { "Retry-After": String(wait) });
  let raw: string;
  try {
    raw = await readRawBody(req, MAX_WEBHOOK_BYTES);
  } catch (err: any) {
    return sendJson(res, err?.status || 400, { error: err?.message || "Could not read body" });
  }
  const result = handlePaymentWebhook(raw, req.headers[SIGNATURE_HEADER]);
  return sendJson(res, result.status, result.body);
}
