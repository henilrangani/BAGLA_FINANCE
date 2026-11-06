/**
 * Bagla FastAPI client.
 *
 * - Access token: kept in memory only (never persisted).
 * - Refresh token: an HttpOnly, Secure, SameSite cookie set by the API on /api/v1/auth.
 *   Page scripts can never read it. localStorage keeps only a non-secret marker
 *   ({user_id, email}) so the app knows which account profile to open.
 * - Auth requests send X-Bagla-Client: web (cookie mode) and X-Bagla-CSRF: 1 (required by
 *   the API for refresh/logout; a cross-site form can't set it).
 * - On a 401 the client refreshes once (the server rotates the cookie) and retries.
 * - Upgrade: a refresh token left in localStorage by an older version is exchanged once
 *   for the cookie and then deleted from storage.
 * - Money is always integer paise on the wire.
 */

// Production builds default to the app's own origin: the host rewrites /api/v1/* to the API
// (DEPLOYMENT_RUNBOOK.md), so the refresh cookie is first-party and the CSP stays connect-src 'self'.
const ENV = (import.meta as any).env || {};
export const API_BASE: string =
  ENV.VITE_API_URL?.replace(/\/$/, "") ?? (ENV.PROD ? "" : "http://127.0.0.1:8000");

const SESSION_KEY = "bagla_session_v1";

export interface StoredSession {
  user_id: string;
  email: string;
  /** Legacy (pre-cookie) only; removed after the one-time upgrade. Never written by this version. */
  refresh_token?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
    this.name = "ApiError";
  }
  /** Network failure / server unreachable (safe to retry later). */
  get isOffline() {
    return this.status === 0;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let offlineGuard: () => boolean = () => false;

/** The app's offline mode blocks every request at the client. */
export function setOfflineGuard(fn: () => boolean) {
  offlineGuard = fn;
}

export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: session lasts for this tab only */
  }
}

function messageFrom(body: any, status: number): string {
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
  if (Array.isArray(d) && d[0]?.msg) return `${d[0].loc?.slice(-1)[0] ?? "field"}: ${d[0].msg}`;
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "The server had a problem. Please try again.";
  return `Request failed (${status})`;
}

const AUTH_PATH = "/api/v1/auth/";

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  if (offlineGuard()) throw new ApiError(0, "Offline mode is on. Turn it off to sync with your account.");
  if (path.startsWith(AUTH_PATH)) {
    // Only auth calls carry the cookie (it is path-scoped to /api/v1/auth anyway).
    init = { ...init, credentials: "include",
      headers: { ...(init.headers as Record<string, string> | undefined), "X-Bagla-Client": "web", "X-Bagla-CSRF": "1" } };
  }
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "Can't reach the Bagla server. Your changes are kept and will sync when you're back online.");
  }
}

async function refresh(): Promise<boolean> {
  const s = readSession();
  if (!s) return false;
  if (!refreshing) {
    refreshing = (async () => {
      const legacy = s.refresh_token;
      const r = await rawFetch("/api/v1/auth/refresh", legacy
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: legacy }) }
        : { method: "POST" });
      if (!r.ok) {
        // 401 = expired/revoked; 400/422 = a stored token that can never work. Either way the
        // session is over (local data is kept); 429/5xx/offline keep it for a later retry.
        if (r.status === 401 || r.status === 400 || r.status === 422) {
          writeSession(null);
          accessToken = null;
        }
        return false;
      }
      const t = await r.json();
      accessToken = t.access_token;
      writeSession({ user_id: s.user_id, email: s.email }); // the new token is in the cookie only
      return true;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type Opts = { idempotencyKey?: string; auth?: boolean };

export async function api<T = any>(method: Method, path: string, body?: unknown, opts: Opts = {}): Promise<T> {
  return (await apiWithStatus<T>(method, path, body, opts)).data;
}

/** Like api(), but also returns the HTTP status (e.g. 200 = idempotent replay, 201 = created). */
export async function apiWithStatus<T = any>(method: Method, path: string, body?: unknown, opts: Opts = {}):
Promise<{ status: number; data: T }> {
  const doFetch = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    if (opts.auth !== false && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    return rawFetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  if (opts.auth !== false && !accessToken && readSession()) await refresh();
  let r = await doFetch();
  if (r.status === 401 && opts.auth !== false && (await refresh())) r = await doFetch();
  if (r.status === 204) return { status: 204, data: undefined as T };
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!r.ok) throw new ApiError(r.status, messageFrom(data, r.status), data);
  return { status: r.status, data: data as T };
}

async function signIn(path: string, payload: object): Promise<StoredSession> {
  const t = await api<any>("POST", path, payload, { auth: false });
  accessToken = t.access_token;
  const me = await api<any>("GET", "/api/v1/users/me");
  const s = { user_id: me.id, email: me.email }; // refresh token: HttpOnly cookie, never stored here
  writeSession(s);
  return s;
}

export const auth = {
  login: (email: string, password: string) => signIn("/api/v1/auth/login", { email, password }),
  register: (email: string, password: string, full_name: string, timezone: string, locale = "en") =>
    signIn("/api/v1/auth/register", { email, password, full_name, timezone, locale }),
  async logout() {
    try {
      if (readSession()) await api("POST", "/api/v1/auth/logout");
    } catch {
      /* server unreachable: still sign out locally */
    }
    accessToken = null;
    writeSession(null);
  },
  /** For tests. */
  _reset() {
    accessToken = null;
    refreshing = null;
  },
};
