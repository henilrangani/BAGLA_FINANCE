/**
 * Reading a bill photo is provider-independent: the scanner screen only talks to a ReceiptReader.
 * Today there is one implementation, which asks this app's server (/api/ai/scan-receipt, backed by an AI
 * provider only when the server has one configured). When no reader is available, the screen offers
 * manual entry. A reading is only a draft: nothing is saved until the person reviews it and confirms.
 */
import { parsePaiseInput } from "../utils/split";

export interface ReceiptDraft {
  merchant: string;
  date: string;          // YYYY-MM-DD or "" when not read
  totalPaise: number;    // 0 = not read; never guessed
  taxPaise: number;
  items: { name: string; quantity: number; pricePaise: number }[];
  confidence: number;    // 0–1 from the reader; 0 for manual entry
  source: "reader" | "manual";
}

export type ReadResult = { ok: true; draft: ReceiptDraft } | { ok: false; reason: string };

export interface ReceiptReader {
  readonly name: string;
  /** Whether automatic reading can work right now (provider configured, online). */
  available(signal?: AbortSignal): Promise<boolean>;
  read(dataUrl: string, mimeType: string, signal?: AbortSignal): Promise<ReadResult>;
}

export const emptyDraft = (today: string): ReceiptDraft =>
  ({ merchant: "", date: today, totalPaise: 0, taxPaise: 0, items: [], confidence: 0, source: "manual" });

const toPaiseStrict = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return parsePaiseInput(v.toFixed(2)) ?? 0;
  if (typeof v === "string") return parsePaiseInput(v) ?? 0;
  return 0;
};
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Server-backed reader. Turns the response into a draft; unreadable values become empty, not guesses. */
export const serverReceiptReader: ReceiptReader = {
  name: "Bagla server (AI provider, when configured)",
  async available(signal) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    try {
      const r = await fetch("/api/ai/status", { signal });
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return false;
      return !!(await r.json())?.configured;
    } catch {
      return false;
    }
  },
  async read(dataUrl, mimeType, signal) {
    let res: Response;
    try {
      res = await fetch("/api/ai/scan-receipt", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ imageBase64: dataUrl, mimeType }),
      });
    } catch (e) {
      if (signal?.aborted) return { ok: false, reason: "Stopped. Nothing was read or saved." };
      return { ok: false, reason: "Couldn't reach the server to read the bill." };
    }
    if (res.status === 413) return { ok: false, reason: "That image is too large (4 MB at most)." };
    if (res.status === 415) return { ok: false, reason: "Use a JPEG, PNG or WebP photo." };
    if (res.status === 429) return { ok: false, reason: "Too many scans in a short time. Wait a minute." };
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return { ok: false, reason: `The server couldn't read it (HTTP ${res.status}).` };
    const d = await res.json();
    if (d?.error) return { ok: false, reason: String(d.error) };
    const draft: ReceiptDraft = {
      merchant: typeof d?.merchant === "string" ? d.merchant.slice(0, 80) : "",
      date: isoDate(d?.date),
      totalPaise: toPaiseStrict(d?.totalAmount),
      taxPaise: toPaiseStrict(d?.taxAmount),
      items: (Array.isArray(d?.items) ? d.items : []).slice(0, 50).map((i: any) => ({
        name: String(i?.name || "").slice(0, 80), quantity: Number.isInteger(i?.quantity) && i.quantity > 0 ? i.quantity : 1,
        pricePaise: toPaiseStrict(i?.price),
      })).filter((i: any) => i.name),
      confidence: Math.max(0, Math.min(1, Number(d?.confidence) || 0)),
      source: "reader",
    };
    if (!draft.totalPaise) return { ok: false, reason: "The total couldn't be read from this photo. Enter the details yourself." };
    return { ok: true, draft };
  },
};
