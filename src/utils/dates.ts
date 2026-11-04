/**
 * Local-date helpers.
 *
 * `new Date().toISOString().split("T")[0]` returns the UTC date, which for
 * India (UTC+5:30) files anything entered between 00:00 and 05:29 under the
 * previous day. These helpers use the user's local calendar date instead.
 */

/** Device time zone, e.g. "Asia/Kolkata". Falls back to Asia/Kolkata. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** Local calendar date as YYYY-MM-DD. */
export function localDateString(date: Date = new Date(), timeZone: string = deviceTimeZone()): string {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Local time as HH:mm (24h). */
export function localTimeString(date: Date = new Date(), timeZone: string = deviceTimeZone()): string {
  const p = parts(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Local month prefix as YYYY-MM. */
export function localMonthPrefix(date: Date = new Date(), timeZone: string = deviceTimeZone()): string {
  return localDateString(date, timeZone).slice(0, 7);
}

/** True if s is a real calendar date in YYYY-MM-DD form. */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Whole days between two YYYY-MM-DD dates (absolute), independent of time zone. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(Math.round((toUtc(a) - toUtc(b)) / 86_400_000));
}
