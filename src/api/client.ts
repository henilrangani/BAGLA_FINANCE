/**
 * Bagla FastAPI client.
 *
 * - Access token: kept in memory only (never persisted).
 * - Refresh token: persisted in localStorage so the user stays signed in.
 *   LIMITATION: readable by any script on the page (mitigated by the strict
 *   CSP: script-src 'self'). Moving it to an httpOnly cookie is planned.
 * - On a 401 the client refreshes once (rotating the refresh token) and retries.
 * - Money is always integer paise on the wire.
 */

export const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const SESSION_KEY = "bagla_session_v1";

export interface StoredSession {
  refresh_token: string;
  user_id: string;
  email: string;
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
  if (Array.isArray(d) && d[0]?.msg) return `${d[0].loc?.slice(-1)[0] ?? "field"}: ${d[0].msg}`;
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "The server had a problem. Please try again.";
  return `Request failed (${status})`;
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  if (offlineGuard()) throw new ApiError(0, "Offline mode is on. Turn it off to sync with your account.");
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
      const r = await rawFetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!r.ok) {
        if (r.status === 401) {
          writeSession(null);
          accessToken = null;
        }
        return false;
      }
      const t = await r.json();
      accessToken = t.access_token;
      writeSession({ ...s, refresh_token: t.refresh_token });
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
  const s = { refresh_token: t.refresh_token, user_id: me.id, email: me.email };
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
