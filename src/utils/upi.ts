/**
 * Build an NPCI `upi://pay` intent link safely.
 *
 * The app never initiates payments itself: this only opens the user's own UPI
 * app with fields pre-filled; the user confirms (and enters their PIN) there.
 * Every field is validated and URL-encoded so user-entered values (e.g. a
 * group member's UPI ID like "x@bank&am=99999") can't inject extra
 * parameters such as a different amount.
 */
import { safeRupees, toPaise, MAX_AMOUNT_PAISE } from "./money";

// VPA: handle@psp. Handle allows letters, digits, dot, hyphen, underscore.
const VPA_PATTERN = /^[a-zA-Z0-9._-]{1,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function isValidVpa(vpa: string): boolean {
  return VPA_PATTERN.test((vpa || "").trim());
}

export function buildUpiPayLink(opts: { vpa: string; name?: string; amountRupees?: number; note?: string }): string | null {
  const vpa = (opts.vpa || "").trim();
  if (!isValidVpa(vpa)) return null;
  const params = new URLSearchParams();
  params.set("pa", vpa);
  if (opts.name) params.set("pn", opts.name.slice(0, 50));
  if (opts.amountRupees !== undefined) {
    const paise = toPaise(Math.abs(safeRupees(opts.amountRupees)));
    if (paise <= 0 || paise > MAX_AMOUNT_PAISE) return null;
    params.set("am", (paise / 100).toFixed(2));
  }
  params.set("cu", "INR");
  if (opts.note) params.set("tn", opts.note.slice(0, 80));
  return `upi://pay?${params.toString()}`;
}
