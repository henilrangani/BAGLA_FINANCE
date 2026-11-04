import { describe, expect, it } from "vitest";
import { hashPin, isValidPin, lockoutDelayMs, verifyPin } from "./pin";

describe("PIN hashing", () => {
  it("verifies the right PIN and rejects others, including the old 1234 backdoor", async () => {
    const rec = await hashPin("4821", 1000);
    expect(rec.hash).not.toContain("4821");
    expect(await verifyPin("4821", rec)).toBe(true);
    expect(await verifyPin("1234", rec)).toBe(false);
    expect(await verifyPin("", rec)).toBe(false);
  });

  it("salts each hash", async () => {
    const a = await hashPin("4821", 1000);
    const b = await hashPin("4821", 1000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("rejects missing records and invalid PINs", async () => {
    expect(await verifyPin("4821", undefined)).toBe(false);
    expect(isValidPin("12")).toBe(false);
    expect(isValidPin("12ab")).toBe(false);
    expect(isValidPin("123456")).toBe(true);
    await expect(hashPin("12")).rejects.toThrow();
  });

  it("backs off after repeated failures", () => {
    expect(lockoutDelayMs(4)).toBe(0);
    expect(lockoutDelayMs(5)).toBe(30_000);
    expect(lockoutDelayMs(6)).toBe(60_000);
    expect(lockoutDelayMs(50)).toBe(15 * 60_000);
  });
});
