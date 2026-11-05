/**
 * Storage profiles keep local-only data and account data strictly apart.
 *
 * - "local": the original browser-only data under the original keys
 *   (bagla_transactions_v1, ...). Never modified by account mode.
 * - "cloud:<userId>": a cache of the user's server data under suffixed keys
 *   (bagla_transactions_v1__<userId>). The server is the source of truth.
 *
 * Switching profiles reloads the page so every store re-initialises cleanly.
 */
const PROFILE_KEY = "bagla_active_profile_v1";

export type Profile = { kind: "local" } | { kind: "cloud"; userId: string };

export function activeProfile(): Profile {
  try {
    const v = localStorage.getItem(PROFILE_KEY) || "local";
    if (v.startsWith("cloud:") && /^[0-9a-f-]{36}$/i.test(v.slice(6))) return { kind: "cloud", userId: v.slice(6) };
  } catch {
    /* storage unavailable */
  }
  return { kind: "local" };
}

export function setActiveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, p.kind === "local" ? "local" : `cloud:${p.userId}`);
  } catch {
    /* ignore */
  }
}

/** Storage key for the active profile. Local profile keeps the original key names. */
export function profileKey(base: string, p: Profile = activeProfile()): string {
  return p.kind === "local" ? base : `${base}__${p.userId}`;
}
