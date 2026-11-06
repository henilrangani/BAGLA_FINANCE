import { describe, expect, it } from "vitest";
import { allocateEqual, allocateWeighted, computeSplit, parsePaiseInput, parsePercentBp } from "./split";

describe("allocation (same vectors as backend tests/test_group_flexible.py)", () => {
  it.each([
    [10_000, [1, 1, 1], [3334, 3333, 3333]],
    [1, [1, 1], [1, 0]],
    [99_999, [5000, 3000, 2000], [49999, 30000, 20000]],
    [10_001, [2, 1, 1], [5001, 2500, 2500]],
    [100, [3333, 3333, 3334], [33, 33, 34]],
  ])("allocateWeighted(%i, %j) = %j", (total, w, out) => {
    expect(allocateWeighted(total, w)).toEqual(out);
  });

  it("equal split matches the server's order (first people get the extra paisa)", () => {
    expect(allocateEqual(101, 2)).toEqual([51, 50]);
    expect(allocateEqual(10_000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("always sums exactly, for random inputs", () => {
    let seed = 20261106;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let k = 0; k < 2000; k++) {
      const n = 1 + rnd(20);
      const w = Array.from({ length: n }, () => 1 + rnd(10_000));
      const total = 1 + rnd(10_000_000);
      const out = allocateWeighted(total, w);
      expect(out.reduce((a, b) => a + b, 0)).toBe(total);
      expect(allocateEqual(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("refuses zero or fractional weights", () => {
    expect(() => allocateWeighted(100, [0, 1])).toThrow();
    expect(() => allocateWeighted(100, [1.5])).toThrow();
  });
});

describe("input parsing without floating point", () => {
  it("percent", () => {
    expect(parsePercentBp("33.33")).toBe(3333);
    expect(parsePercentBp("50")).toBe(5000);
    expect(parsePercentBp("0.5")).toBe(50);
    expect(parsePercentBp("100.01")).toBeNull();
    expect(parsePercentBp("1.234")).toBeNull();
    expect(parsePercentBp("-5")).toBeNull();
  });
  it("rupees", () => {
    expect(parsePaiseInput("120.5")).toBe(12050);
    expect(parsePaiseInput("₹1,250.75")).toBe(125075);
    expect(parsePaiseInput("0.1")).toBe(10);
    expect(parsePaiseInput("1.005")).toBeNull();
  });
});

describe("computeSplit", () => {
  const ids = ["a", "b", "c"];
  it("equal among selected people only", () => {
    const r = computeSplit({ method: "equal", totalPaise: 1001, participantIds: ["a", "c"] });
    expect(r.ok).toBe(true);
    expect(r.shares).toEqual([{ memberId: "a", paise: 501 }, { memberId: "c", paise: 500 }]);
  });
  it("exact must add up to the total, and says by how much it's off", () => {
    let r = computeSplit({ method: "exact", totalPaise: 1000, participantIds: ids, values: { a: "5", b: "3" } });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(200);
    expect(r.error).toMatch(/₹2.00 still to assign/);
    r = computeSplit({ method: "exact", totalPaise: 1000, participantIds: ids, values: { a: "5", b: "3", c: "2.50" } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/more than the total/);
    r = computeSplit({ method: "exact", totalPaise: 1000, participantIds: ids, values: { a: "5", b: "3", c: "2" } });
    expect(r.ok).toBe(true);
  });
  it("percentages must total 100 and odd paise are allocated exactly", () => {
    let r = computeSplit({ method: "percentage", totalPaise: 99_999, participantIds: ids, values: { a: "50", b: "30", c: "10" } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/10% still to assign/);
    r = computeSplit({ method: "percentage", totalPaise: 99_999, participantIds: ids, values: { a: "50", b: "30", c: "20" } });
    expect(r.ok).toBe(true);
    expect(r.shares.map(s => s.paise)).toEqual([49999, 30000, 20000]);
    expect(r.weights).toEqual([{ memberId: "a", weight: 5000 }, { memberId: "b", weight: 3000 }, { memberId: "c", weight: 2000 }]);
  });
  it("shares (weights): 0 excludes a person; default is 1 each", () => {
    let r = computeSplit({ method: "shares", totalPaise: 10_001, participantIds: ids, values: { a: "2" } });
    expect(r.shares.map(s => s.paise)).toEqual([5001, 2500, 2500]);
    r = computeSplit({ method: "shares", totalPaise: 900, participantIds: ids, values: { a: "1", b: "0", c: "2" } });
    expect(r.shares).toEqual([{ memberId: "a", paise: 300 }, { memberId: "c", paise: 600 }]);
    r = computeSplit({ method: "shares", totalPaise: 900, participantIds: ids, values: { a: "1.5" } });
    expect(r.ok).toBe(false);
  });
  it("needs a total and at least one participant", () => {
    expect(computeSplit({ method: "equal", totalPaise: 0, participantIds: ids }).ok).toBe(false);
    expect(computeSplit({ method: "equal", totalPaise: 100, participantIds: [] }).ok).toBe(false);
  });
});
