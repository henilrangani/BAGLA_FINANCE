/**
 * Money helpers for Bagla Finance.
 *
 * Rule: all arithmetic is done in integer minor units (paise for INR).
 * Binary floating point is only used at the edges (display, legacy storage),
 * and every value crossing that edge is normalised to an exact paise amount.
 *
 * INR ordinary posted payments have paise precision (₹0.01). Amounts with
 * more than two decimals are rejected at input rather than silently rounded.
 */

export const PAISE_PER_RUPEE = 100;

/** Upper bound for a single amount: ₹1,000 crore (1e12 paise). Guards against typos and overflow. */
export const MAX_AMOUNT_PAISE = 1_000_000_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertSafeInteger(paise: number, label = "amount"): void {
  if (!Number.isSafeInteger(paise)) {
    throw new MoneyError(`${label} must be a whole number of paise`);
  }
}

/**
 * Convert a rupee number (possibly from legacy float storage) to integer paise.
 * Uses string formatting to avoid 1.005 * 100 = 100.49999 style errors.
 */
export function toPaise(rupees: number): number {
  if (typeof rupees !== "number" || !Number.isFinite(rupees)) {
    throw new MoneyError("amount must be a finite number");
  }
  // toFixed(3) then round half away from zero on the third digit.
  const negative = rupees < 0;
  const [whole, frac = ""] = Math.abs(rupees).toFixed(3).split(".");
  let paise = Number(whole) * PAISE_PER_RUPEE + Number(frac.slice(0, 2).padEnd(2, "0"));
  if (Number(frac[2] ?? "0") >= 5) paise += 1;
  return negative ? -paise : paise;
}

/** Convert integer paise to a rupee number (for display / legacy storage only). */
export function fromPaise(paise: number): number {
  assertSafeInteger(paise);
  return paise / PAISE_PER_RUPEE;
}

/** Normalise any rupee number to an exact paise value (e.g. 10.1 + 20.2 -> 30.3). */
export function normalizeRupees(rupees: number): number {
  return fromPaise(toPaise(rupees));
}

/** Coerce unknown legacy values (string, null, NaN) to a rupee amount; invalid -> 0. */
export function safeRupees(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return normalizeRupees(n);
}

/** Sum rupee values exactly (via paise). Invalid entries count as 0. */
export function sumRupees(values: Iterable<unknown>): number {
  let total = 0;
  for (const v of values) total += toPaise(safeRupees(v));
  return fromPaise(total);
}

/** Exact subtraction a - b in rupees. */
export function subtractRupees(a: number, b: number): number {
  return fromPaise(toPaise(safeRupees(a)) - toPaise(safeRupees(b)));
}

/** Exact addition a + b in rupees. */
export function addRupees(a: number, b: number): number {
  return fromPaise(toPaise(safeRupees(a)) + toPaise(safeRupees(b)));
}

export type ParseResult =
  | { ok: true; paise: number; rupees: number }
  | { ok: false; error: string };

/**
 * Parse user / statement input such as "1,250.50", "₹ 99", "Rs. 12.5", "INR 1,00,000".
 * - Rejects more than two decimal places (₹0.001 is not an ordinary INR amount).
 * - Rejects negative values unless allowNegative is set.
 * - Rejects zero unless allowZero is set.
 */
export function parseRupeeInput(
  input: string | number,
  opts: { allowNegative?: boolean; allowZero?: boolean } = {}
): ParseResult {
  let s = String(input ?? "").trim();
  if (!s) return { ok: false, error: "Enter an amount" };

  s = s.replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/\s*(₹|rs\.?|inr)$/i, "").trim();
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^(₹|rs\.?|inr)\s*/i, "");

  // Digits with optional Indian/Western thousands separators, optional decimals.
  if (!/^\d{1,3}(,\d{2,3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) {
    return { ok: false, error: "Amount must be a number like 1250 or 1,250.50" };
  }
  const [whole, frac = ""] = s.replace(/,/g, "").split(".");
  if (frac.length > 2) {
    return { ok: false, error: "INR amounts can have at most 2 decimal places (paise)" };
  }
  const paise = Number(whole) * PAISE_PER_RUPEE + Number(frac.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(paise) || paise > MAX_AMOUNT_PAISE) {
    return { ok: false, error: "Amount is too large" };
  }
  if (paise === 0 && !opts.allowZero) return { ok: false, error: "Amount must be greater than zero" };
  if (negative && !opts.allowNegative) return { ok: false, error: "Amount cannot be negative" };

  const signed = negative ? -paise : paise;
  return { ok: true, paise: signed, rupees: fromPaise(signed) };
}

/**
 * Split an integer paise total into parts proportional to weights using the
 * largest-remainder method. The parts always sum exactly to the total.
 * Ties for the leftover paise go to the earliest index (deterministic).
 */
export function allocatePaise(totalPaise: number, weights: number[]): number[] {
  assertSafeInteger(totalPaise, "total");
  if (weights.length === 0) throw new MoneyError("at least one share is required");
  if (weights.some(w => !Number.isFinite(w) || w < 0)) throw new MoneyError("weights must be non-negative");
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) throw new MoneyError("weights must not all be zero");

  const sign = totalPaise < 0 ? -1 : 1;
  const abs = Math.abs(totalPaise);
  const raw = weights.map(w => (abs * w) / weightSum);
  const parts = raw.map(Math.floor);
  let remainder = abs - parts.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    parts[order[k].i] += 1;
  }
  return parts.map(p => p * sign);
}

/** Split a rupee amount equally among n people; shares sum exactly to the amount. */
export function splitRupeesEqually(amountRupees: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new MoneyError("number of people must be at least 1");
  return allocatePaise(toPaise(amountRupees), Array(n).fill(1)).map(fromPaise);
}

/** Format a rupee amount for display with Indian grouping, e.g. ₹1,20,000.50. */
export function formatINR(rupees: number, opts: { showPaise?: boolean } = {}): string {
  const value = safeRupees(rupees);
  const hasPaise = toPaise(value) % PAISE_PER_RUPEE !== 0;
  const digits = opts.showPaise ?? hasPaise ? 2 : 0;
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
