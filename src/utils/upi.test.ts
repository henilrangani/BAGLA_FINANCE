import { describe, expect, it } from "vitest";
import { buildUpiPayLink, isValidVpa } from "./upi";

describe("buildUpiPayLink", () => {
  it("builds an encoded link with a 2-decimal amount", () => {
    const link = buildUpiPayLink({ vpa: "asha.k@okhdfcbank", name: "Asha K", amountRupees: 33.34, note: "Goa trip" });
    expect(link).toBe("upi://pay?pa=asha.k%40okhdfcbank&pn=Asha+K&am=33.34&cu=INR&tn=Goa+trip");
  });

  it("blocks parameter injection through the UPI ID", () => {
    expect(buildUpiPayLink({ vpa: "x@bank&am=99999", amountRupees: 10 })).toBeNull();
    expect(isValidVpa("x@bank&am=99999")).toBe(false);
  });

  it("keeps injected text inside the name/note fields", () => {
    const link = buildUpiPayLink({ vpa: "a@okicici", name: "Bob&am=99999", amountRupees: 1 })!;
    const params = new URLSearchParams(link.split("?")[1]);
    expect(params.get("am")).toBe("1.00");
    expect(params.get("pn")).toBe("Bob&am=99999");
    expect(params.getAll("am")).toHaveLength(1);
  });

  it("rejects bad VPAs and amounts", () => {
    expect(buildUpiPayLink({ vpa: "not-a-vpa" })).toBeNull();
    expect(buildUpiPayLink({ vpa: "a@okaxis", amountRupees: 0 })).toBeNull();
    expect(buildUpiPayLink({ vpa: "a@okaxis", amountRupees: 1e13 })).toBeNull();
    expect(buildUpiPayLink({ vpa: "a@okaxis" })).toBe("upi://pay?pa=a%40okaxis&cu=INR");
  });
});
