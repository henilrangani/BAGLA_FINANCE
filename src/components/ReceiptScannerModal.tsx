/**
 * Scan a bill: choose or take a photo → (automatic reading, only if the server has a provider) → review and
 * correct every field → explicit Save. Without automatic reading the same form is filled in by hand.
 * Nothing is saved without the person pressing Save; a possible duplicate must be acknowledged first.
 * The photo is only shown for reference; it is not stored.
 */
import React, { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, PencilLine, Plus, Trash2 } from "lucide-react";
import { useFinance } from "../context/FinanceContext";
import { CloseButton, Modal } from "./ui/Modal";
import { emptyDraft, serverReceiptReader, type ReceiptDraft, type ReceiptReader } from "../services/receiptReader";
import { allocateEqual, parsePaiseInput } from "../utils/split";
import { localDateString } from "../utils/dates";
import { detectDuplicateTransaction } from "../services/data";
import type { PaymentMethod } from "../types";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = "w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#047857]";
const lbl = "text-xs font-bold text-gray-700 dark:text-slate-300 block mb-1";

type Step = "choose" | "reading" | "review" | "saved";
interface Form { merchant: string; date: string; total: string; categoryId: string; method: PaymentMethod; target: string;
  items: { name: string; price: string }[] }

export const ReceiptScannerModal: React.FC<{ reader?: ReceiptReader }> = ({ reader = serverReceiptReader }) => {
  const { isReceiptModalOpen, setIsReceiptModalOpen, categories, groups, transactions, addTransaction, addGroupExpense, settings } = useFinance();
  const [step, setStep] = useState<Step>("choose");
  const [canRead, setCanRead] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<ReceiptDraft["source"]>("manual");
  const [form, setForm] = useState<Form | null>(null);
  const [tried, setTried] = useState(false);
  const [dupOk, setDupOk] = useState(false);
  const [saved, setSaved] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const expenseCats = categories.filter(c => (c as any).defaultType !== "income");
  const otherId = expenseCats.find(c => /other/i.test(c.name))?.id || expenseCats[0]?.id || "cat-other";

  useEffect(() => {
    if (!isReceiptModalOpen) return;
    setStep("choose"); setPreview(null); setNotice(""); setForm(null); setTried(false); setDupOk(false); setSaved("");
    const ctl = new AbortController();
    setCanRead(null);
    if (settings.offlineMode) { setCanRead(false); return; }
    reader.available(ctl.signal).then(setCanRead).catch(() => setCanRead(false));
    return () => ctl.abort();
  }, [isReceiptModalOpen, reader, settings.offlineMode]);

  if (!isReceiptModalOpen) return null;

  const toForm = (d: ReceiptDraft): Form => ({
    merchant: d.merchant, date: d.date || localDateString(), total: d.totalPaise ? (d.totalPaise / 100).toFixed(2) : "",
    categoryId: otherId, method: "upi", target: "",
    items: d.items.map(i => ({ name: i.name, price: i.pricePaise ? (i.pricePaise / 100).toFixed(2) : "" })),
  });
  const manual = (why = "") => { setSource("manual"); setForm(toForm(emptyDraft(localDateString()))); setNotice(why); setStep("review"); };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) { setNotice("Use a JPEG, PNG or WebP photo of the bill."); return; }
    if (file.size > MAX_BYTES) { setNotice("That photo is larger than 4 MB. Take a closer, smaller photo."); return; }
    const fr = new FileReader();
    fr.onload = async () => {
      const dataUrl = String(fr.result);
      setPreview(dataUrl);
      if (!canRead) { manual("Automatic reading isn't set up, so type the details from the photo."); return; }
      setStep("reading"); setNotice("");
      const ctl = new AbortController();
      abortRef.current = ctl;
      const r = await reader.read(dataUrl, file.type, ctl.signal);
      abortRef.current = null;
      if (r.ok === false) { manual(`${r.reason} Nothing was saved.`); return; }
      setSource("reader");
      setForm(toForm(r.draft));
      setNotice("Read automatically. Check every field against the bill before saving; readings can be wrong.");
      setStep("review");
    };
    fr.onerror = () => setNotice("Couldn't open that file.");
    fr.readAsDataURL(file);
  };

  // ---- review validation (integer paise; nothing is adjusted silently)
  const totalPaise = form ? parsePaiseInput(form.total) : null;
  const itemPaise = form ? form.items.map(i => (i.price.trim() ? parsePaiseInput(i.price) : 0)) : [];
  const itemsSum = itemPaise.reduce<number>((s, p) => s + (p || 0), 0);
  const errors: string[] = [];
  if (form) {
    if (!form.total.trim()) errors.push("Enter the bill total.");
    else if (totalPaise === null || totalPaise <= 0) errors.push("The total must be an amount like 682 or 682.50.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.push("Choose the bill date.");
    if (itemPaise.some(p => p === null)) errors.push("Item prices must be amounts like 120 or 120.50.");
  }
  const group = form?.target ? groups.find(g => g.id === form.target) : undefined;
  const dup = form && totalPaise && totalPaise > 0 && !group
    ? detectDuplicateTransaction({ amount: totalPaise / 100, date: form.date, merchant: form.merchant, type: "expense" }, transactions)
    : { isDuplicate: false as const };
  const dirty = step === "review" || step === "reading" || !!preview;

  const save = () => {
    setTried(true);
    if (!form || errors.length || !totalPaise) return;
    if (dup.isDuplicate && !dupOk) return;
    const merchant = form.merchant.trim() || "Bill";
    const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const receiptData = { merchant, date: form.date, totalAmount: totalPaise / 100, confidence: source === "reader" ? 1 : 0,
      items: form.items.filter(i => i.name.trim()).map((i, k) => ({ name: i.name.trim(), quantity: 1, price: (itemPaise[k] || 0) / 100 })) };
    if (group) {
      const members = group.members;
      const shares = allocateEqual(totalPaise, members.length);
      const me = members.find(m => m.isCurrentUser) || members[0];
      addGroupExpense(group.id, { description: `${merchant} bill`, amount: totalPaise / 100, currency: group.currency || "INR",
        categoryId: form.categoryId, paidByMemberId: me.id, splitType: "equal",
        participants: members.map((m, i) => ({ memberId: m.id, amountOwed: shares[i] / 100 })), date: form.date, time, receiptData });
      setSaved(`Added ${rupees(totalPaise)} to “${group.name}”, split equally between ${members.length} people.`);
    } else {
      const r = addTransaction({ amount: totalPaise / 100, type: "expense", currency: "INR", merchant,
        description: `Bill: ${merchant}`, categoryId: form.categoryId, date: form.date, time, paymentMethod: form.method,
        source: "receipt", receiptData, status: "verified", confidence: 1,
        notes: source === "reader" ? "Read from a bill photo and checked before saving." : "Entered from a bill.",
        tags: ["receipt", source === "reader" ? "read-automatically" : "manual-entry"] });
      if (!r.success) { setNotice(r.error || "That expense couldn't be saved. Nothing was recorded."); return; }
      setSaved(`Saved ${rupees(totalPaise)} at ${merchant}.`);
    }
    setStep("saved");
  };

  const set = (patch: Partial<Form>) => setForm(f => (f ? { ...f, ...patch } : f));
  const close = () => { abortRef.current?.abort(); setIsReceiptModalOpen(false); };

  return (
    <Modal onClose={close} dirty={dirty && step !== "saved"} labelledBy="receipt-title">
      {requestClose => (
        <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg border border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh]">
          <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-slate-800">
            <div>
              <h3 id="receipt-title" className="text-base font-black text-gray-900 dark:text-white">Scan a bill</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {step === "review" ? (source === "reader" ? "Step 2 of 2 · check what was read" : "Enter the bill details")
                  : step === "saved" ? "Done" : "Step 1 of 2 · add the bill"}
              </p>
            </div>
            <CloseButton onClick={requestClose} />
          </div>

          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            {step === "choose" && (
              <>
                <p role="status" data-testid="reader-status" className={`text-xs p-3 rounded-2xl ${canRead
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"}`}>
                  {canRead === null ? "Checking whether automatic reading is available…"
                    : canRead ? "Automatic reading is on: the photo is sent to this app's server, which uses an AI provider to read it. You'll check every field before anything is saved."
                    : "Automatic reading isn't set up on this server. You can attach the photo for reference and type the details yourself."}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="cursor-pointer p-4 rounded-2xl border border-gray-200 dark:border-slate-700 text-center text-xs font-bold text-gray-800 dark:text-slate-100 hover:border-[#047857]">
                    <Camera className="w-5 h-5 mx-auto mb-1 text-[#047857]" /> Take photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={onFile} disabled={canRead === null} />
                  </label>
                  <label className="cursor-pointer p-4 rounded-2xl border border-gray-200 dark:border-slate-700 text-center text-xs font-bold text-gray-800 dark:text-slate-100 hover:border-[#047857]">
                    <ImagePlus className="w-5 h-5 mx-auto mb-1 text-[#047857]" /> Choose photo
                    <input data-testid="receipt-file" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} disabled={canRead === null} />
                  </label>
                  <button type="button" onClick={() => manual()} className="p-4 rounded-2xl border border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-800 dark:text-slate-100 hover:border-[#047857] cursor-pointer">
                    <PencilLine className="w-5 h-5 mx-auto mb-1 text-[#047857]" /> Enter manually
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">JPEG, PNG or WebP, up to 4 MB. PDFs aren't supported yet.</p>
                {notice && <p role="alert" className="text-xs font-semibold text-rose-600">{notice}</p>}
              </>
            )}

            {step === "reading" && (
              <div className="text-center py-8 space-y-3" role="status">
                {preview && <img src={preview} alt="Bill photo" className="max-h-40 mx-auto rounded-xl border border-gray-200 dark:border-slate-700" />}
                <p className="text-sm text-gray-700 dark:text-slate-200 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reading the bill…</p>
                <button type="button" onClick={() => abortRef.current?.abort()} className="px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-600 text-xs font-bold cursor-pointer text-gray-700 dark:text-slate-200">Stop</button>
              </div>
            )}

            {step === "review" && form && (
              <form noValidate onSubmit={e => { e.preventDefault(); save(); }} className="space-y-3" id="receipt-form">
                {notice && <p role="status" data-testid="receipt-notice" className="text-xs p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">{notice}</p>}
                {preview && <img src={preview} alt="Bill photo for reference" className="max-h-32 rounded-xl border border-gray-200 dark:border-slate-700" />}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label htmlFor="rc-merchant" className={lbl}>Shop or merchant</label>
                    <input id="rc-merchant" data-autofocus className={field} value={form.merchant} maxLength={80} onChange={e => set({ merchant: e.target.value })} placeholder="e.g. Sharma General Store" /></div>
                  <div><label htmlFor="rc-total" className={lbl}>Total paid (₹) *</label>
                    <input id="rc-total" className={field} inputMode="decimal" value={form.total} onChange={e => set({ total: e.target.value })} placeholder="e.g. 682.50" /></div>
                  <div><label htmlFor="rc-date" className={lbl}>Bill date *</label>
                    <input id="rc-date" type="date" className={field} value={form.date} onChange={e => set({ date: e.target.value })} /></div>
                  <div><label htmlFor="rc-cat" className={lbl}>Category</label>
                    <select id="rc-cat" className={field} value={form.categoryId} onChange={e => set({ categoryId: e.target.value })}>
                      {expenseCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label htmlFor="rc-method" className={lbl}>Paid by</label>
                    <select id="rc-method" className={field} value={form.method} onChange={e => set({ method: e.target.value as PaymentMethod })} disabled={!!form.target}>
                      <option value="upi">UPI</option><option value="cash">Cash</option><option value="debit_card">Debit card</option>
                      <option value="credit_card">Credit card</option><option value="bank_transfer">Bank transfer</option></select></div>
                  {groups.length > 0 && (
                    <div className="col-span-2"><label htmlFor="rc-target" className={lbl}>Save to</label>
                      <select id="rc-target" className={field} value={form.target} onChange={e => set({ target: e.target.value })}>
                        <option value="">My expenses</option>
                        {groups.map(g => <option key={g.id} value={g.id}>Group: {g.name} (I paid, split equally)</option>)}</select></div>
                  )}
                </div>

                <fieldset className="space-y-1.5">
                  <legend className={lbl}>Items (optional)</legend>
                  {form.items.map((it, i) => (
                    <div key={i} className="flex gap-2">
                      <input aria-label={`Item ${i + 1} name`} className={field} value={it.name} maxLength={80}
                        onChange={e => set({ items: form.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                      <input aria-label={`Item ${i + 1} price`} className={`${field} w-28`} inputMode="decimal" value={it.price}
                        onChange={e => set({ items: form.items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} />
                      <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => set({ items: form.items.filter((_, j) => j !== i) })}
                        className="w-11 shrink-0 flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => set({ items: [...form.items, { name: "", price: "" }] })}
                    className="text-xs font-bold text-[#047857] dark:text-emerald-400 flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add item</button>
                  {form.items.length > 0 && totalPaise && itemsSum !== totalPaise && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400" data-testid="items-mismatch">
                      Items add up to {rupees(itemsSum)} but the total is {rupees(totalPaise)} (tax, tips or a misread). The total is what gets saved.
                    </p>
                  )}
                </fieldset>

                {dup.isDuplicate && (
                  <div role="alert" className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                    <p className="font-bold">This may already be recorded.</p>
                    <p>{(dup as any).reason}</p>
                    <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={dupOk} onChange={e => setDupOk(e.target.checked)} className="w-4 h-4 accent-[#047857]" /> It's a different bill, save it anyway</label>
                  </div>
                )}
                {tried && errors.length > 0 && <ul role="alert" className="text-xs font-semibold text-rose-600 list-disc ml-5">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
              </form>
            )}

            {step === "saved" && (
              <div className="text-center py-8 space-y-2" role="status">
                <CheckCircle2 className="w-10 h-10 mx-auto text-[#047857]" />
                <p className="text-sm font-bold text-gray-900 dark:text-white" data-testid="receipt-saved">{saved}</p>
              </div>
            )}
          </div>

          <div className="flex gap-2 px-6 py-4 border-t border-gray-100 dark:border-slate-800">
            {step === "review" && (
              <>
                <button type="button" onClick={() => { setStep("choose"); setForm(null); setPreview(null); setNotice(""); setTried(false); }}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 text-sm font-bold text-gray-700 dark:text-slate-200 cursor-pointer">Back</button>
                <button type="submit" form="receipt-form" aria-disabled={dup.isDuplicate && !dupOk}
                  className="flex-1 py-2.5 bg-[#047857] hover:bg-[#065f46] text-white font-bold text-sm rounded-xl cursor-pointer">Save expense</button>
              </>
            )}
            {step === "saved" && (
              <>
                <button type="button" onClick={() => { setStep("choose"); setForm(null); setPreview(null); setNotice(""); setTried(false); setDupOk(false); }}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 text-sm font-bold text-gray-700 dark:text-slate-200 cursor-pointer">Scan another</button>
                <button type="button" onClick={close} className="flex-1 py-2.5 bg-[#047857] text-white font-bold text-sm rounded-xl cursor-pointer">Done</button>
              </>
            )}
            {(step === "choose" || step === "reading") && (
              <button type="button" onClick={requestClose} className="ml-auto px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 text-sm font-bold text-gray-700 dark:text-slate-200 cursor-pointer">Cancel</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
