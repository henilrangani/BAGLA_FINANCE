/**
 * App-lock PIN hashing (PBKDF2-SHA256 via Web Crypto).
 *
 * IMPORTANT: the app lock is a *privacy screen* for a shared or unattended
 * device. All ledger data still lives unencrypted in this browser's
 * localStorage, so anyone with access to the browser profile or dev tools can
 * read it. Real protection needs server-side accounts (Phase 2).
 *
 * What this does guarantee: the PIN itself is never stored in plain text,
 * there is no master/default PIN, and repeated wrong guesses are slowed down.
 */

export interface PinRecord {
  algo: "PBKDF2-SHA256";
  iterations: number;
  salt: string; // base64
  hash: string; // base64
}

export const PIN_ITERATIONS = 210_000;
export const PIN_PATTERN = /^\d{4,6}$/;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export async function hashPin(pin: string, iterations = PIN_ITERATIONS): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error("PIN must be 4 to 6 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, iterations);
  return { algo: "PBKDF2-SHA256", iterations, salt: b64(salt), hash: b64(hash) };
}

export async function verifyPin(pin: string, record: PinRecord | undefined | null): Promise<boolean> {
  if (!record || !record.salt || !record.hash || typeof pin !== "string") return false;
  const actual = await derive(pin, unb64(record.salt), record.iterations || PIN_ITERATIONS);
  const expected = unb64(record.hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

/** Delay (ms) required before the next attempt after `failures` wrong PINs. */
export function lockoutDelayMs(failures: number): number {
  if (failures < 5) return 0;
  return Math.min(30_000 * 2 ** (failures - 5), 15 * 60_000); // 30s, 60s, ... max 15 min
}
