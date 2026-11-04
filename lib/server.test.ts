import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __setGeminiClientForTests,
  fallbackParseExpense,
  handleChat,
  handleParseExpense,
  handleScanReceipt,
  sanitizeChatReply,
  sanitizeParsedExpense,
  sanitizeReceipt,
  validateReceiptImage,
} from "./ai";
import { RateLimiter, clientIp, isAllowedOrigin, isJsonRequest, securityHeaders } from "./security";
import { handlePaymentWebhook, signPayload, verifyWebhook } from "./webhook";

beforeEach(() => __setGeminiClientForTests(null)); // force "no AI" paths
afterEach(() => __setGeminiClientForTests(undefined));

describe("security helpers", () => {
  it("sets CSP and HSTS only in production", () => {
    expect(securityHeaders(true)["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(securityHeaders(false)["Content-Security-Policy"]).toBeUndefined();
    expect(securityHeaders(false)["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("blocks cross-site origins but allows same-origin and listed origins", () => {
    expect(isAllowedOrigin({ host: "app.example.com" })).toBe(true);
    expect(isAllowedOrigin({ host: "app.example.com", origin: "https://app.example.com" })).toBe(true);
    expect(isAllowedOrigin({ host: "app.example.com", origin: "https://evil.example" })).toBe(false);
    expect(isAllowedOrigin({ host: "x", origin: "https://ok.example" }, ["https://ok.example"])).toBe(true);
    expect(isAllowedOrigin({ host: "x", origin: "not a url" })).toBe(false);
  });

  it("requires JSON content type", () => {
    expect(isJsonRequest({ "content-type": "application/json; charset=utf-8" })).toBe(true);
    expect(isJsonRequest({ "content-type": "application/x-www-form-urlencoded" })).toBe(false);
    expect(isJsonRequest({})).toBe(false);
  });

  it("only trusts X-Forwarded-For behind a proxy", () => {
    const h = { "x-forwarded-for": "1.2.3.4, 10.0.0.1" };
    expect(clientIp(h, "9.9.9.9", false)).toBe("9.9.9.9");
    expect(clientIp(h, "9.9.9.9", true)).toBe("1.2.3.4");
  });

  it("rate limits per key and resets after the window", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.check("a", 0)).toBe(0);
    expect(rl.check("a", 10)).toBe(0);
    expect(rl.check("a", 20)).toBeGreaterThan(0);
    expect(rl.check("b", 20)).toBe(0);
    expect(rl.check("a", 1001)).toBe(0);
  });
});

describe("webhook verification", () => {
  const secret = "test-secret-value";
  const body = JSON.stringify({ provider: "UPI", amount: "250.50", merchant: "Shop", referenceId: "ref-1" });
  const now = 1_800_000_000_000;
  const t = Math.floor(now / 1000);

  it("is disabled without a secret", () => {
    expect(verifyWebhook(body, "t=1,v1=" + "0".repeat(64), undefined, now)).toMatchObject({ ok: false, status: 503 });
  });

  it("accepts a valid signature once, then rejects the replay", () => {
    const sig = `t=${t},v1=${signPayload(secret, t, body)}`;
    expect(verifyWebhook(body, sig, secret, now).ok).toBe(true);
    expect(verifyWebhook(body, sig, secret, now)).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects tampered bodies, wrong secrets, stale timestamps and junk", () => {
    const t2 = t + 1;
    const good = signPayload(secret, t2, body);
    expect(verifyWebhook(body + " ", `t=${t2},v1=${good}`, secret, now)).toMatchObject({ ok: false, status: 401 });
    expect(verifyWebhook(body, `t=${t2},v1=${signPayload("other", t2, body)}`, secret, now)).toMatchObject({ ok: false, status: 401 });
    const old = t - 301;
    expect(verifyWebhook(body, `t=${old},v1=${signPayload(secret, old, body)}`, secret, now)).toMatchObject({ ok: false, status: 401 });
    expect(verifyWebhook(body, undefined, secret, now)).toMatchObject({ ok: false, status: 401 });
    expect(verifyWebhook(body, "garbage", secret, now)).toMatchObject({ ok: false, status: 401 });
  });

  it("validates the payload after verifying the signature", () => {
    const ts = Math.floor(Date.now() / 1000);
    const bad = JSON.stringify({ amount: "10.001", referenceId: "r" });
    expect(handlePaymentWebhook(bad, `t=${ts},v1=${signPayload(secret, ts, bad)}`, secret).status).toBe(400);
    const ok = JSON.stringify({ amount: 99, referenceId: "r-ok" });
    const res = handlePaymentWebhook(ok, `t=${ts},v1=${signPayload(secret, ts, ok)}`, secret);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "verified_not_stored" });
  });
});

describe("AI input validation and fallbacks", () => {
  it("rejects missing / oversized text", async () => {
    expect((await handleParseExpense({})).status).toBe(400);
    expect((await handleParseExpense({ text: "x".repeat(501) })).status).toBe(413);
  });

  it("fallback parser never invents an amount", () => {
    expect(fallbackParseExpense("lunch with friends").amount).toBe(0);
    expect(fallbackParseExpense("2 coffees and 3 samosas").amount).toBe(0); // ambiguous
    expect(fallbackParseExpense("paid ₹1,250.50 for groceries").amount).toBe(1250.5);
    expect(fallbackParseExpense("auto 60 rupees").amount).toBe(60);
    expect(fallbackParseExpense("auto 60 rupees").category).toBe("Transport");
    expect(fallbackParseExpense("anything").needsReview).toBe(true);
  });

  it("uses the fallback when no AI key is configured", async () => {
    const r = await handleParseExpense({ text: "chai 20 rs cash" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ amount: 20, paymentMethod: "cash", aiAvailable: false });
  });

  it("sanitises AI expense output", () => {
    const out = sanitizeParsedExpense(
      { amount: -250.555, category: "CRYPTO", paymentMethod: "wire", date: "2026-02-30", confidence: 7 },
      "note"
    );
    expect(out.amount).toBe(250.56);
    expect(out.category).toBe("Other");
    expect(out.paymentMethod).toBe("upi");
    expect(out.confidence).toBe(1);
    expect(out.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sanitizeParsedExpense({ amount: "abc", confidence: 0.99 }, "n")).toMatchObject({ amount: 0, confidence: 0, needsReview: true });
  });

  it("validates receipt images", async () => {
    expect(validateReceiptImage({}).ok).toBe(false);
    expect(validateReceiptImage({ imageBase64: "data:image/gif;base64,AAAA" })).toMatchObject({ ok: false, status: 415 });
    expect(validateReceiptImage({ imageBase64: "not base64!!" })).toMatchObject({ ok: false, status: 400 });
    expect(validateReceiptImage({ imageBase64: "A".repeat(6 * 1024 * 1024) })).toMatchObject({ ok: false, status: 413 });
    expect(validateReceiptImage({ imageBase64: "data:image/png;base64,iVBORw0KGgo=" }).ok).toBe(true);
    const r = await handleScanReceipt({ imageBase64: "data:image/png;base64,iVBORw0KGgo=" });
    expect(r.body).toMatchObject({ totalAmount: 0, needsReview: true });
  });

  it("sanitises receipts", () => {
    const out = sanitizeReceipt({ totalAmount: "680.5", items: [{ name: "x", price: -10, quantity: "abc" }], confidence: 0.5 });
    expect(out.totalAmount).toBe(680.5);
    expect(out.items[0]).toMatchObject({ price: 10, quantity: undefined });
    expect(out.needsReview).toBe(true);
  });

  it("limits chat input and filters suggested actions", async () => {
    expect((await handleChat({ message: "" })).status).toBe(400);
    expect((await handleChat({ message: "x".repeat(2001) })).status).toBe(413);
    expect((await handleChat({ message: "hi", financialData: { blob: "x".repeat(25_000) } })).status).toBe(413);
    const out = sanitizeChatReply({
      reply: "ok",
      suggestedActions: [
        { id: "1", label: "Pay", actionType: "transfer_money", payload: { amount: 1e9 } },
        { id: "2", label: "Budget", actionType: "create_budget", payload: { amount: "5000.999", category: "Food" } },
      ],
    });
    expect(out.suggestedActions).toHaveLength(1);
    expect(out.suggestedActions[0].payload.amount).toBe(5001);
  });
});
