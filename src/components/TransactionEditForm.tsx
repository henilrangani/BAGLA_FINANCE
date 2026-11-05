import React, { useState } from "react";
import type { Category, Transaction } from "../types";
import { parseRupeeInput } from "../utils/money";
import { isValidIsoDate } from "../utils/dates";

interface Props {
  tx: Transaction;
  categories: Category[];
  onSave: (updates: Partial<Transaction>) => void;
  onCancel: () => void;
}

const input = "w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500";

/** Edit amount, description, category and date. In account mode the change is
 * sent as an audited server update (the history keeps the before/after values). */
export const TransactionEditForm: React.FC<Props> = ({ tx, categories, onSave, onCancel }) => {
  const [amount, setAmount] = useState(String(tx.amount));
  const [description, setDescription] = useState(tx.description || "");
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [date, setDate] = useState(tx.date);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseRupeeInput(amount);
    if (parsed.ok === false) return setError(parsed.error);
    if (!isValidIsoDate(date)) return setError("Enter a valid date");
    if (!description.trim()) return setError("Enter a description");
    const updates: Partial<Transaction> = {};
    if (parsed.rupees !== tx.amount) updates.amount = parsed.rupees;
    if (description.trim() !== tx.description) updates.description = description.trim();
    if (categoryId !== tx.categoryId) updates.categoryId = categoryId;
    if (date !== tx.date) updates.date = date;
    if (Object.keys(updates).length === 0) return onCancel();
    onSave(updates);
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-xs" aria-label="Edit transaction">
      <label className="block font-bold text-gray-700 dark:text-slate-300">Amount (₹)
        <input className={`${input} mt-1`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required />
      </label>
      <label className="block font-bold text-gray-700 dark:text-slate-300">Description
        <input className={`${input} mt-1`} value={description} maxLength={500} onChange={e => setDescription(e.target.value)} required />
      </label>
      <label className="block font-bold text-gray-700 dark:text-slate-300">Category
        <select className={`${input} mt-1`} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="block font-bold text-gray-700 dark:text-slate-300">Date
        <input className={`${input} mt-1`} type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </label>
      {error && <p role="alert" className="font-semibold text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl cursor-pointer">Save changes</button>
        <button type="button" onClick={onCancel} className="flex-1 py-3 border border-gray-300 dark:border-slate-700 font-bold rounded-2xl cursor-pointer">Cancel</button>
      </div>
    </form>
  );
};
