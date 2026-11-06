/**
 * Add a group expense: who paid, who took part, and how to split (equal, exact amounts, percentages or
 * shares). The preview shows each person's share in exact paise, computed by the same algorithm the
 * server uses. Saving is only possible when the shares add up exactly to the total.
 */
import React, { useMemo, useState } from "react";
import { CloseButton, Modal } from "../ui/Modal";
import type { Category, Group, GroupExpense } from "../../types";
import { computeSplit, formatBp, parsePaiseInput, type SplitMethod } from "../../utils/split";
import { localDateString } from "../../utils/dates";

const METHODS: { id: SplitMethod; label: string; hint: string }[] = [
  { id: "equal", label: "Equally", hint: "Everyone ticked pays the same (to the paisa)." },
  { id: "exact", label: "Exact amounts", hint: "Type each person's amount; it must add up to the total." },
  { id: "percentage", label: "Percentages", hint: "Type each person's %; it must add up to 100%." },
  { id: "shares", label: "Shares", hint: "e.g. 2 for someone who had double; 0 leaves a person out." },
];

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = "w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#047857]";
const lbl = "text-xs font-bold text-gray-700 dark:text-slate-300 block mb-1";

interface Props {
  group: Group;
  categories: Category[];
  onClose: () => void;
  onSave: (e: Omit<GroupExpense, "id" | "groupId" | "createdAt">) => void;
}

export const GroupExpenseDialog: React.FC<Props> = ({ group, categories, onClose, onSave }) => {
  const members = group.members;
  const me = members.find(m => m.isCurrentUser) || members[0];
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "cat-food");
  const [paidBy, setPaidBy] = useState(me?.id || "");
  const [method, setMethod] = useState<SplitMethod>("equal");
  const [participants, setParticipants] = useState<string[]>(members.map(m => m.id));
  // Each method keeps its own inputs, so ₹50 typed as an exact amount never becomes "50 shares".
  const [valuesBy, setValuesBy] = useState<Record<SplitMethod, Record<string, string>>>({ equal: {}, exact: {}, percentage: {}, shares: {} });
  const values = valuesBy[method];
  const setValues = (v: Record<string, string>) => setValuesBy(prev => ({ ...prev, [method]: v }));
  const [tried, setTried] = useState(false);

  const totalPaise = parsePaiseInput(amount) ?? 0;
  const selected = members.filter(m => participants.includes(m.id)).map(m => m.id);
  const result = useMemo(() => computeSplit({ method, totalPaise, participantIds: selected, values }),
    [method, totalPaise, selected.join(","), JSON.stringify(values)]); // eslint-disable-line react-hooks/exhaustive-deps
  const shareOf = new Map<string, number>();
  result.shares.forEach(s => shareOf.set(s.memberId, s.paise));
  const nameOf = (id: string) => members.find(m => m.id === id)?.name || "Someone";
  const dirty = !!(description.trim() || amount.trim()
    || (["exact", "percentage", "shares"] as SplitMethod[]).some(m => Object.keys(valuesBy[m]).some(k => (valuesBy[m][k] || "").trim())));

  const descError = !description.trim() ? "Say what it was for." : "";
  const amountError = !amount.trim() ? "Enter the total amount." : parsePaiseInput(amount) === null || totalPaise <= 0
    ? "Use an amount like 1200 or 1200.50." : "";
  const canSave = !descError && !amountError && result.ok && !!paidBy;

  const setValue = (id: string, v: string) => setValuesBy(prev => ({ ...prev, [method]: { ...prev[method], [id]: v } }));
  const toggle = (id: string) => setParticipants(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const fillEven = () => {
    // Even percentages in basis points (e.g. 33.34 / 33.33 / 33.33), or equal amounts for exact.
    const n = selected.length;
    if (!n) return;
    const unit = method === "percentage" ? 10_000 : totalPaise;
    const base = Math.floor(unit / n), rem = unit % n;
    const next: Record<string, string> = { ...values };
    selected.forEach((id, i) => {
      const v = base + (i < rem ? 1 : 0);
      next[id] = method === "percentage" ? formatBp(v).replace("%", "") : (v / 100).toFixed(2);
    });
    setValues(next);
  };

  const save = () => {
    setTried(true);
    if (!canSave) return false;
    onSave({
      description: description.trim(),
      amount: totalPaise / 100,
      currency: group.currency || "INR",
      categoryId,
      paidByMemberId: paidBy,
      splitType: method,
      participants: result.shares.map(s => ({ memberId: s.memberId, amountOwed: s.paise / 100 })),
      splitWeights: result.weights,
      date: localDateString(),
      time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    });
    return true;
  };

  return (
    <Modal onClose={onClose} dirty={dirty} labelledBy="grp-exp-title">
      {close => (
        <form noValidate onSubmit={e => { e.preventDefault(); if (save()) onClose(); }}
          className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg border border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh]">
          <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-slate-800">
            <div>
              <h3 id="grp-exp-title" className="text-base font-black text-gray-900 dark:text-white">Add Group Expense</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">For {group.name}</p>
            </div>
            <CloseButton onClick={close} />
          </div>

          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ge-desc" className={lbl}>What was it for? *</label>
                <input id="ge-desc" data-autofocus className={field} value={description} maxLength={300}
                  onChange={e => setDescription(e.target.value)} placeholder="e.g. Dinner at Leopold" />
              </div>
              <div>
                <label htmlFor="ge-amount" className={lbl}>Total amount (₹) *</label>
                <input id="ge-amount" className={field} inputMode="decimal" value={amount}
                  onChange={e => setAmount(e.target.value)} placeholder="e.g. 2450" />
              </div>
              <div>
                <label htmlFor="ge-paid" className={lbl}>Paid by</label>
                <select id="ge-paid" className={field} value={paidBy} onChange={e => setPaidBy(e.target.value)}>
                  {members.map(m => <option key={m.id} value={m.id}>{m.isCurrentUser ? `${m.name} (you)` : m.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ge-cat" className={lbl}>Category</label>
                <select id="ge-cat" className={field} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <fieldset>
              <legend className={lbl}>How to split</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="radiogroup" aria-label="Split method">
                {METHODS.map(m => (
                  <button key={m.id} type="button" role="radio" aria-checked={method === m.id} onClick={() => setMethod(m.id)}
                    className={`px-2 py-2 rounded-xl text-xs font-bold border cursor-pointer ${method === m.id
                      ? "bg-[#047857] border-[#047857] text-white" : "border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5">{METHODS.find(m => m.id === method)!.hint}</p>
            </fieldset>

            <fieldset>
              <div className="flex items-center justify-between">
                <legend className={lbl}>Who took part, and each person's share</legend>
                {(method === "percentage" || (method === "exact" && totalPaise > 0)) && (
                  <button type="button" onClick={fillEven} className="text-[11px] font-bold text-[#047857] dark:text-emerald-400 cursor-pointer hover:underline">
                    Fill evenly
                  </button>
                )}
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl" aria-label="Split preview">
                {members.map(m => {
                  const on = participants.includes(m.id);
                  const share = shareOf.get(m.id);
                  return (
                    <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                      <input id={`ge-p-${m.id}`} type="checkbox" checked={on} onChange={() => toggle(m.id)}
                        className="w-5 h-5 accent-[#047857]" />
                      <label htmlFor={`ge-p-${m.id}`} className="flex-1 text-sm text-gray-900 dark:text-white truncate">
                        {m.isCurrentUser ? `${m.name} (you)` : m.name}
                      </label>
                      {on && method !== "equal" && (
                        <span className="flex items-center gap-1">
                          {method === "exact" && <span className="text-xs text-gray-500">₹</span>}
                          <input aria-label={`${m.name} ${method === "exact" ? "amount" : method === "percentage" ? "percent" : "shares"}`}
                            inputMode="decimal" className="w-20 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm text-right text-gray-900 dark:text-white"
                            value={values[m.id] ?? (method === "shares" ? "1" : "")}
                            onChange={e => setValue(m.id, e.target.value)} placeholder={method === "shares" ? "1" : "0"} />
                          {method === "percentage" && <span className="text-xs text-gray-500">%</span>}
                        </span>
                      )}
                      <span className="w-24 text-right text-sm font-bold tabular-nums text-gray-900 dark:text-white" data-testid={`share-${m.name}`}>
                        {on && share !== undefined ? rupees(share) : on ? "—" : "not in it"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 text-xs" aria-live="polite">
                {result.ok ? (
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Adds up exactly to {rupees(totalPaise)}.{" "}
                    {paidBy && <>{nameOf(paidBy)} paid, so {nameOf(paidBy)} gets back {rupees(totalPaise - (shareOf.get(paidBy) || 0))} from the others.</>}
                  </p>
                ) : (
                  (tried || totalPaise > 0) && result.error && <p className="font-semibold text-amber-700 dark:text-amber-400">{result.error}</p>
                )}
              </div>
            </fieldset>

            {tried && (descError || amountError) && (
              <p role="alert" className="text-xs font-semibold text-rose-600">{descError || amountError}</p>
            )}
          </div>

          <div className="flex gap-2 px-6 py-4 border-t border-gray-100 dark:border-slate-800">
            <button type="button" onClick={close}
              className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 text-sm font-bold text-gray-700 dark:text-slate-200 cursor-pointer">
              Cancel
            </button>
            <button type="submit" aria-disabled={!canSave}
              className={`flex-1 py-2.5 text-white font-bold text-sm rounded-xl cursor-pointer ${canSave ? "bg-[#047857] hover:bg-[#065f46]" : "bg-gray-400 dark:bg-slate-600"}`}>
              Save expense
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
