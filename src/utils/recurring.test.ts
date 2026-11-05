import { describe, expect, it } from "vitest";
import { monthlyPaise } from "./recurring";

describe("monthlyPaise", () => {
  it("converts weekly, monthly, quarterly and yearly bills to a monthly figure", () => {
    expect(monthlyPaise([{ amountPaise: 79_900, frequency: "monthly" }])).toBe(79_900);
    expect(monthlyPaise([{ amountPaise: 12_000, frequency: "weekly" }])).toBe(52_000); // 12000 * 52 / 12
    expect(monthlyPaise([{ amountPaise: 1_19_900, frequency: "yearly" }])).toBe(9_992); // 9991.67 -> 9992
    expect(monthlyPaise([{ amountPaise: 30_000, frequency: "quarterly" }])).toBe(10_000);
  });
  it("rounds once at the end, not per bill", () => {
    // Three yearly ₹1 bills: 3 * 8.333 = 25 paise (per-bill rounding would give 24).
    expect(monthlyPaise(Array(3).fill({ amountPaise: 100, frequency: "yearly" }))).toBe(25);
    expect(monthlyPaise([])).toBe(0);
  });
});
