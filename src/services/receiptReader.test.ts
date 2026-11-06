import { afterEach, describe, expect, it, vi } from "vitest";
import { serverReceiptReader } from "./receiptReader";

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("server receipt reader (provider-independent interface)", () => {
  it("is unavailable when the server has no provider or can't be reached", async () => {
    vi.stubGlobal("fetch", reply(200, { configured: false }));
    expect(await serverReceiptReader.available()).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await serverReceiptReader.available()).toBe(false);
    vi.stubGlobal("fetch", reply(200, { configured: true }));
    expect(await serverReceiptReader.available()).toBe(true);
  });

  it("turns a reading into exact paise and drops junk instead of guessing", async () => {
    vi.stubGlobal("fetch", reply(200, { merchant: "Sharma Store", date: "2026-11-05", totalAmount: 682.5, taxAmount: "32.50",
      items: [{ name: "Atta", price: 245 }, { name: "", price: 10 }, { name: "Milk", price: -5 }], confidence: 7 }));
    const r = await serverReceiptReader.read("data:image/png;base64,AA==", "image/png");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft).toMatchObject({ merchant: "Sharma Store", date: "2026-11-05", totalPaise: 68250, taxPaise: 3250, confidence: 1, source: "reader" });
      expect(r.draft.items).toEqual([{ name: "Atta", quantity: 1, pricePaise: 24500 }, { name: "Milk", quantity: 1, pricePaise: 0 }]);
    }
  });

  it("fails clearly when the total isn't readable or the server refuses", async () => {
    vi.stubGlobal("fetch", reply(200, { totalAmount: 0, merchant: "x" }));
    expect(await serverReceiptReader.read("d", "image/png")).toEqual({ ok: false, reason: expect.stringMatching(/total couldn't be read/) });
    vi.stubGlobal("fetch", reply(200, { totalAmount: 0, error: "Receipt scanning is unavailable. Please enter the details manually." }));
    expect(await serverReceiptReader.read("d", "image/png")).toEqual({ ok: false, reason: expect.stringMatching(/unavailable/) });
    vi.stubGlobal("fetch", reply(413, { error: "too big" }));
    expect(await serverReceiptReader.read("d", "image/png")).toEqual({ ok: false, reason: expect.stringMatching(/too large/) });
  });
});
