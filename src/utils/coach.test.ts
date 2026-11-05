import { describe, expect, it } from "vitest";
import { coachInsight } from "./coach";

describe("coachInsight", () => {
  it("never claims progress with no data", () => {
    expect(coachInsight(0, 0)).toMatch(/No income or spending recorded/);
    expect(coachInsight(0, 0)).not.toMatch(/on track/);
  });

  it("handles spending without income", () => {
    expect(coachInsight(0, 450)).toMatch(/₹450 of spending this month but no income/);
  });

  it("reports overspending exactly", () => {
    expect(coachInsight(10000, 12500.5)).toMatch(/spent ₹2,500.50 more than your recorded income/);
  });

  it("computes the savings rate without rounding up", () => {
    expect(coachInsight(50000, 45001)).toMatch(/saving 9.9%/);
    expect(coachInsight(50000, 41000)).toMatch(/saving 18%.*getting close/);
    expect(coachInsight(50000, 26499, [{ name: "Rent", amount: 15000 }, { name: "Food", amount: 3000 }]))
      .toMatch(/saving 47%.*at or above.*biggest category is Rent \(₹15,000\)/);
  });
});
