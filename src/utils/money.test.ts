import { describe, expect, it } from "vitest";
import {
  addRupees,
  allocatePaise,
  formatINR,
  fromPaise,
  MoneyError,
  normalizeRupees,
  parseRupeeInput,
  safeRupees,
  splitRupeesEqually,
  subtractRupees,
  sumRupees,
  toPaise,
} from "./money";

describe("toPaise / fromPaise", () => {
  it("converts exact values", () => {
    expect(toPaise(250)).toBe(25000);
    expect(toPaise(0.01)).toBe(1);
    expect(toPaise(10000)).toBe(1_000_000);
    expect(fromPaise(25000)).toBe(250);
  });

  it("avoids binary float errors", () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(-12.345)).toBe(-1235);
  });

  it("rejects non-finite input", () => {
    expect(() => toPaise(NaN)).toThrow(MoneyError);
    expect(() => toPaise(Infinity)).toThrow(MoneyError);
    expect(() => fromPaise(1.5)).toThrow(MoneyError);
  });
});

describe("exact arithmetic", () => {
  it("sums without drift", () => {
    expect(sumRupees([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sumRupees(Array(1000).fill(0.01))).toBe(10);
    expect(sumRupees([10, "abc", null, undefined, NaN, 5])).toBe(15);
  });

  it("adds and subtracts", () => {
    expect(addRupees(10.1, 20.2)).toBe(30.3);
    expect(subtractRupees(100, 33.33)).toBe(66.67);
  });

  it("normalises and coerces", () => {
    expect(normalizeRupees(30.300000000000004)).toBe(30.3);
    expect(safeRupees("12.5")).toBe(12.5);
    expect(safeRupees(undefined)).toBe(0);
  });
});

describe("parseRupeeInput", () => {
  it.each([
    ["250", 25000],
    ["1,250.50", 125050],
    ["1,00,000", 10_000_000],
    ["₹ 99", 9900],
    ["Rs. 12.5", 1250],
    ["INR 0.01", 1],
  ])("parses %s", (input, paise) => {
    expect(parseRupeeInput(input)).toEqual({ ok: true, paise, rupees: paise / 100 });
  });

  it("rejects sub-paise precision", () => {
    const r = parseRupeeInput("10.001");
    expect(r.ok).toBe(false);
  });

  it("rejects garbage, zero and negatives by default", () => {
    expect(parseRupeeInput("").ok).toBe(false);
    expect(parseRupeeInput("abc").ok).toBe(false);
    expect(parseRupeeInput("1.2.3").ok).toBe(false);
    expect(parseRupeeInput("0").ok).toBe(false);
    expect(parseRupeeInput("-50").ok).toBe(false);
    expect(parseRupeeInput("1e5").ok).toBe(false);
  });

  it("allows negatives when asked (statement debits)", () => {
    expect(parseRupeeInput("-1,250.00", { allowNegative: true })).toEqual({ ok: true, paise: -125000, rupees: -1250 });
    expect(parseRupeeInput("(500)", { allowNegative: true })).toEqual({ ok: true, paise: -50000, rupees: -500 });
    expect(parseRupeeInput("-₹500", { allowNegative: true })).toEqual({ ok: true, paise: -50000, rupees: -500 });
  });

  it("rejects absurdly large amounts", () => {
    expect(parseRupeeInput("99999999999999").ok).toBe(false);
  });
});

describe("allocatePaise / splitRupeesEqually", () => {
  it("never loses or invents a paisa", () => {
    for (const total of [1, 99, 100, 10000, 12345, 999999]) {
      for (let n = 1; n <= 9; n++) {
        const parts = allocatePaise(total, Array(n).fill(1));
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("splits ₹100 among 3 as 33.34 / 33.33 / 33.33", () => {
    expect(splitRupeesEqually(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });

  it("handles weighted shares", () => {
    expect(allocatePaise(1000, [1, 2, 2])).toEqual([200, 400, 400]);
    const parts = allocatePaise(1001, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1001);
  });

  it("handles negative totals symmetrically", () => {
    expect(allocatePaise(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it("validates inputs", () => {
    expect(() => allocatePaise(100, [])).toThrow(MoneyError);
    expect(() => allocatePaise(100, [0, 0])).toThrow(MoneyError);
    expect(() => allocatePaise(1.5, [1])).toThrow(MoneyError);
    expect(() => splitRupeesEqually(100, 0)).toThrow(MoneyError);
  });
});

describe("formatINR", () => {
  it("uses Indian grouping and shows paise only when present", () => {
    expect(formatINR(120000)).toBe("₹1,20,000");
    expect(formatINR(1250.5)).toBe("₹1,250.50");
    expect(formatINR(10, { showPaise: true })).toBe("₹10.00");
  });
});
