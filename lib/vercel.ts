/**
 * Glue for Vercel Node functions: the same security checks as server.ts.
 */
import { API_HEADERS, LIMITS, LimitName, clientIp, isAllowedOrigin, isJsonRequest, securityHeaders } from "./security";
import type { HandlerResult } from "./ai";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

function send(res: any, status: number, body: unknown, extra: Record<string, string> = {}) {
  for (const [k, v] of Object.entries({ ...securityHeaders(true), ...API_HEADERS, ...extra })) res.setHeader(k, v);
  return res.status(status).json(body);
}

/** Wrap an AI handler with method, origin, content-type and rate-limit checks. */
export function vercelJsonRoute(limit: LimitName, handler: (body: any) => Promise<HandlerResult>) {
  return async function route(req: any, res: any) {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed. Use POST." }, { Allow: "POST" });
    if (!isAllowedOrigin(req.headers, allowedOrigins)) return send(res, 403, { error: "Cross-origin request blocked" });
    if (!isJsonRequest(req.headers)) return send(res, 415, { error: "Content-Type must be application/json" });
    // Vercel sets x-forwarded-for itself, so it is trusted here.
    const ip = clientIp(req.headers, req.socket?.remoteAddress, true);
    const wait = LIMITS[limit].check(`${limit}:${ip}`);
    if (wait > 0) return send(res, 429, { error: "Too many requests. Please wait and try again." }, { "Retry-After": String(wait) });
    try {
      const result = await handler(req.body ?? {});
      return send(res, result.status, result.body);
    } catch (err) {
      console.error(`${limit} handler error:`, (err as Error)?.message);
      return send(res, 500, { error: "Internal error" });
    }
  };
}

/**
 * Read the exact raw request body (needed for HMAC verification).
 * Do NOT access req.body before calling this: Vercel's helper parses the body
 * lazily on first access, which consumes the stream.
 * UNVERIFIED on a live Vercel deployment — test in staging before relying on it.
 */
export async function readRawBody(req: any, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > maxBytes) throw Object.assign(new Error("Payload too large"), { status: 413 });
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export { send as sendJson };
