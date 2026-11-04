import { describe, expect, it } from "vitest";
import { daysBetween, isValidIsoDate, localDateString, localTimeString } from "./dates";

describe("localDateString", () => {
  it("uses the India calendar date, not UTC", () => {
    // 2026-11-04 20:00 UTC == 2026-11-05 01:30 IST
    const d = new Date("2026-11-04T20:00:00Z");
    expect(d.toISOString().split("T")[0]).toBe("2026-11-04");
    expect(localDateString(d, "Asia/Kolkata")).toBe("2026-11-05");
    expect(localTimeString(d, "Asia/Kolkata")).toBe("01:30");
  });

  it("works for other zones", () => {
    const d = new Date("2026-11-04T02:00:00Z");
    expect(localDateString(d, "America/New_York")).toBe("2026-11-03");
  });
});

describe("isValidIsoDate / daysBetween", () => {
  it("validates calendar dates", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("04/11/2026")).toBe(false);
  });

  it("counts whole days", () => {
    expect(daysBetween("2026-11-01", "2026-11-04")).toBe(3);
    expect(daysBetween("2026-03-31", "2026-04-01")).toBe(1);
  });
});
