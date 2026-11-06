/**
 * Group expense splitting in integer paise. Mirrors backend/app/api/v1/routes/splits.py
 * (allocate_equal / allocate_weighted) exactly, so the preview a person sees is what the server records.
 * Every result sums exactly to the total; inputs that can't do so are refused with a reason, never adjusted.
 */

export type SplitMethod = "equal" | "exact" | "percentage" | "shares";

/** Largest remainder: shares differ by at most one paisa; the first `total % n` people get the extra paisa. */
export function allocateEqual(totalPaise: number, n: number): number[] {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0 || n < 1) throw new Error("bad equal split");
  const base = Math.floor(totalPaise / n), rem = totalPaise % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Proportional to positive integer weights; leftover paise go to the largest remainders (ties: earlier first). */
export function allocateWeighted(totalPaise: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) throw new Error("bad total");
  if (weights.length === 0 || weights.some(w => !Number.isSafeInteger(w) || w <= 0)) throw new Error("weights must be positive whole numbers");
  const W = weights.reduce((a, b) => a + b, 0);
  // BigInt keeps total*w exact even for large amounts.
  const T = BigInt(totalPaise), BW = BigInt(W);
  const base = weights.map(w => Number((T * BigInt(w)) / BW));
  const rems = weights.map(w => Number((T * BigInt(w)) % BW));
  let left = totalPaise - base.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).sort((a, b) => rems[b] - rems[a] || a - b);
  for (const i of order) { if (left <= 0) break; base[i] += 1; left -= 1; }
  return base;
}

/** "33.33" → 3333 basis points. Up to two decimals, 0–100. No floating point. */
export function parsePercentBp(input: string): number | null {
  const s = input.trim();
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
  return bp <= 10_000 ? bp : null;
}

/** "120.5" → 12050 paise. Up to two decimals, no negatives, no floating point. */
export function parsePaiseInput(input: string): number | null {
  const s = input.replace(/[,₹\s]/g, "");
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
}

export const formatBp = (bp: number) => `${Math.floor(bp / 100)}${bp % 100 ? `.${String(bp % 100).padStart(2, "0").replace(/0$/, "")}` : ""}%`;

export interface SplitInput {
  method: SplitMethod;
  totalPaise: number;
  /** Members taking part, in display order. */
  participantIds: string[];
  /** Per-member text inputs: rupees (exact), percent (percentage) or whole-number weight (shares). */
  values?: Record<string, string>;
}

export interface SplitResult {
  ok: boolean;
  shares: { memberId: string; paise: number }[];
  /** Why the split can't be saved yet (plain language). */
  error?: string;
  /** exact: paise still to allocate (+) or over-allocated (−). percentage: basis points left. */
  remaining?: number;
  /** What the server needs: weights for percentage/shares. */
  weights?: { memberId: string; weight: number }[];
}

export function computeSplit({ method, totalPaise, participantIds, values = {} }: SplitInput): SplitResult {
  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) return { ok: false, shares: [], error: "Enter the total amount." };
  const ids = Array.from(new Set(participantIds));
  if (ids.length === 0) return { ok: false, shares: [], error: "Choose at least one person who took part." };

  if (method === "equal") {
    const a = allocateEqual(totalPaise, ids.length);
    return { ok: true, shares: ids.map((id, i) => ({ memberId: id, paise: a[i] })) };
  }

  if (method === "exact") {
    const shares: { memberId: string; paise: number }[] = [];
    for (const id of ids) {
      const raw = (values[id] ?? "").trim();
      const p = raw === "" ? 0 : parsePaiseInput(raw);
      if (p === null) return { ok: false, shares: [], error: "Use amounts like 250 or 250.50." };
      shares.push({ memberId: id, paise: p });
    }
    const sum = shares.reduce((s, x) => s + x.paise, 0);
    const remaining = totalPaise - sum;
    if (remaining !== 0) {
      return { ok: false, shares, remaining, error: remaining > 0
        ? `₹${(remaining / 100).toFixed(2)} still to assign.` : `₹${(-remaining / 100).toFixed(2)} more than the total.` };
    }
    if (shares.every(s => s.paise === 0)) return { ok: false, shares, error: "Assign the amount to at least one person." };
    return { ok: true, shares };
  }

  if (method === "percentage") {
    const weights: { memberId: string; weight: number }[] = [];
    for (const id of ids) {
      const bp = parsePercentBp(values[id] ?? "");
      if (bp === null) return { ok: false, shares: [], error: "Use percentages like 25 or 33.33." };
      if (bp > 0) weights.push({ memberId: id, weight: bp });
    }
    const sum = weights.reduce((s, w) => s + w.weight, 0);
    if (sum !== 10_000) {
      return { ok: false, shares: [], remaining: 10_000 - sum,
        error: sum < 10_000 ? `${formatBp(10_000 - sum)} still to assign (total must be 100%).` : `${formatBp(sum - 10_000)} over 100%.` };
    }
    const a = allocateWeighted(totalPaise, weights.map(w => w.weight));
    return { ok: true, weights, shares: weights.map((w, i) => ({ memberId: w.memberId, paise: a[i] })) };
  }

  // shares / weights
  const weights: { memberId: string; weight: number }[] = [];
  for (const id of ids) {
    const raw = (values[id] ?? "1").trim();
    if (!/^\d{1,6}$/.test(raw)) return { ok: false, shares: [], error: "Shares must be whole numbers (for example 1, 2 or 3)." };
    const w = Number(raw);
    if (w > 0) weights.push({ memberId: id, weight: w });
  }
  if (weights.length === 0) return { ok: false, shares: [], error: "Give at least one person a share above 0." };
  const a = allocateWeighted(totalPaise, weights.map(w => w.weight));
  return { ok: true, weights, shares: weights.map((w, i) => ({ memberId: w.memberId, paise: a[i] })) };
}
