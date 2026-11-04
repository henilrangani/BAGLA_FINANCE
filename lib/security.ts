/**
 * HTTP security helpers shared by the Express dev server (server.ts) and the
 * Vercel serverless functions (api/**). Framework-agnostic: they work on plain
 * header maps so both runtimes can use them.
 */

export type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers, name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/** Security headers for every response. CSP only in production (Vite dev needs inline scripts/HMR). */
export function securityHeaders(production: boolean): Record<string, string> {
  const h: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (production) {
    h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    h["Content-Security-Policy"] = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // charts/animations set inline styles
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
  }
  return h;
}

/** API responses must never be cached by browsers or CDNs. */
export const API_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
};

/**
 * Best-effort client IP. Only trusts X-Forwarded-For when told to (behind a
 * proxy such as Vercel); otherwise a client could spoof it to dodge limits.
 */
export function clientIp(headers: Headers, socketAddress: string | undefined, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = header(headers, "x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = header(headers, "x-real-ip");
    if (real) return real.trim();
  }
  return socketAddress || "unknown";
}

/**
 * Reject cross-site browser requests. Same-origin requests either omit Origin
 * or send one whose host matches Host. Extra origins can be allowed via
 * ALLOWED_ORIGINS (comma separated). Non-browser clients send no Origin and are
 * handled by rate limiting instead.
 */
export function isAllowedOrigin(headers: Headers, allowedOrigins: string[] = []): boolean {
  const origin = header(headers, "origin");
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  const host = header(headers, "x-forwarded-host") || header(headers, "host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Requests with a body must be JSON (blocks form-post CSRF). */
export function isJsonRequest(headers: Headers): boolean {
  return (header(headers, "content-type") || "").toLowerCase().startsWith("application/json");
}

/**
 * Fixed-window in-memory rate limiter.
 * LIMITATION: state is per process. On Vercel each warm instance has its own
 * counters, so this slows abuse but is not a hard global cap. Move to Redis
 * (e.g. Upstash) before public launch.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private limit: number, private windowMs: number, private maxKeys = 10_000) {}

  /** Returns remaining seconds to wait when limited, or 0 when allowed. */
  check(key: string, now = Date.now()): number {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    entry.count += 1;
    if (entry.count > this.limit) return Math.ceil((entry.resetAt - now) / 1000);
    return 0;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    if (this.hits.size >= this.maxKeys) this.hits.clear(); // memory guard
  }
}

export const LIMITS = {
  // per IP, per 10 minutes
  "parse-expense": new RateLimiter(40, 10 * 60_000),
  "scan-receipt": new RateLimiter(10, 10 * 60_000),
  chat: new RateLimiter(30, 10 * 60_000),
  "daily-summary": new RateLimiter(20, 10 * 60_000),
  anomalies: new RateLimiter(20, 10 * 60_000),
  webhook: new RateLimiter(120, 10 * 60_000),
};
export type LimitName = keyof typeof LIMITS;
