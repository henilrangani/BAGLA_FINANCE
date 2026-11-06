/**
 * Create or edit a group: custom name, type (or a custom category), icon, description, optional budget and,
 * when creating, any number of people (2–30 including you). Names typed here are just labels for
 * people taking part: no account is created or looked up. People join with an invite code later.
 */
import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CloseButton, Modal } from "../ui/Modal";
import type { GroupType } from "../../types";
import { parsePaiseInput } from "../../utils/split";

export const GROUP_TYPES: { id: GroupType; label: string; emoji: string }[] = [
  { id: "rent", label: "Rent", emoji: "🏠" },
  { id: "flatmates", label: "Flatmates", emoji: "🛋️" },
  { id: "trip", label: "Trip", emoji: "🧳" },
  { id: "food", label: "Food", emoji: "🍽️" },
  { id: "household", label: "Household", emoji: "🏡" },
  { id: "event", label: "Event", emoji: "🎉" },
  { id: "friends", label: "Friends", emoji: "🧑‍🤝‍🧑" },
  { id: "family", label: "Family", emoji: "👨‍👩‍👧" },
  { id: "custom", label: "Custom", emoji: "✨" },
];
const ICONS = ["🏠", "🛋️", "🧳", "🏖️", "🏔️", "🍽️", "☕", "🏡", "🎉", "🎂", "🏏", "💼", "🎓", "🚗", "🧑‍🤝‍🧑", "👨‍👩‍👧", "✨", "👥"];

export const MIN_PEOPLE = 2;  // including you
export const MAX_PEOPLE = 30; // including you (the server allows up to 50 members)

export function groupTypeLabel(type?: GroupType, label?: string): string {
  if (type === "custom") return label || "Custom";
  return GROUP_TYPES.find(t => t.id === type)?.label || "Custom";
}

export interface GroupSetupValues {
  name: string;
  groupType: GroupType;
  groupLabel?: string;
  emoji: string;
  description: string;
  budgetRupees?: number;
  memberNames: string[]; // create only; excludes you
}

interface Props {
  mode: "create" | "edit";
  initial?: Partial<GroupSetupValues>;
  myName: string;
  onClose: () => void;
  onSubmit: (v: GroupSetupValues) => void;
}

const field = "w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#047857]";
const lbl = "text-xs font-bold text-gray-700 dark:text-slate-300 block mb-1";

export const GroupSetupDialog: React.FC<Props> = ({ mode, initial = {} as Partial<GroupSetupValues>, myName, onClose, onSubmit }) => {
  const [name, setName] = useState(initial.name || "");
  const [groupType, setGroupType] = useState<GroupType>(initial.groupType || "custom");
  const [groupLabel, setGroupLabel] = useState(initial.groupLabel || "");
  const [emoji, setEmoji] = useState(initial.emoji || GROUP_TYPES.find(t => t.id === (initial.groupType || "custom"))!.emoji);
  const [emojiTouched, setEmojiTouched] = useState(!!initial.emoji);
  const [description, setDescription] = useState(initial.description || "");
  const [budget, setBudget] = useState(initial.budgetRupees ? String(initial.budgetRupees) : "");
  const [members, setMembers] = useState<string[]>(mode === "create" ? (initial.memberNames?.length ? initial.memberNames : [""]) : []);
  const [tried, setTried] = useState(false);

  const start = useMemo(() => JSON.stringify({ name, groupType, groupLabel, emoji, description, budget, members }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify({ name, groupType, groupLabel, emoji, description, budget, members }) !== start;

  const cleaned = members.map(m => m.trim());
  const people = cleaned.filter(Boolean);
  const dupes = new Set(people.filter((m, i) => people.findIndex(x => x.toLowerCase() === m.toLowerCase()) !== i).map(m => m.toLowerCase()));
  const budgetPaise = budget.trim() ? parsePaiseInput(budget) : 0;

  const errors: string[] = [];
  if (!name.trim()) errors.push("Give the group a name.");
  if (groupType === "custom" && groupLabel.trim().length > 40) errors.push("Keep the custom category under 40 characters.");
  if (budget.trim() && (budgetPaise === null || budgetPaise <= 0)) errors.push("Budget must be an amount like 5000 or 5000.50, or left empty.");
  if (mode === "create") {
    if (people.length + 1 < MIN_PEOPLE) errors.push("Add at least one other person.");
    else if (cleaned.some(m => !m)) errors.push("Fill in or remove the empty name rows.");
    if (people.length + 1 > MAX_PEOPLE) errors.push(`A group can have up to ${MAX_PEOPLE} people.`);
    if (dupes.size) errors.push("Two people have the same name. Add an initial so you can tell them apart.");
  }

  const pickType = (t: GroupType) => {
    setGroupType(t);
    if (!emojiTouched) setEmoji(GROUP_TYPES.find(x => x.id === t)!.emoji);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errors.length) return;
    onSubmit({
      name: name.trim(), groupType, groupLabel: groupType === "custom" ? groupLabel.trim() || undefined : undefined,
      emoji: emoji || "👥", description: description.trim(),
      budgetRupees: budgetPaise ? budgetPaise / 100 : undefined, memberNames: people,
    });
  };

  const title = mode === "create" ? "Create a group" : "Edit group details";
  return (
    <Modal onClose={onClose} dirty={dirty} labelledBy="group-setup-title">
      {close => (
        <form onSubmit={submit} noValidate
          className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg border border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh]">
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-slate-800">
            <h3 id="group-setup-title" className="text-base font-black text-gray-900 dark:text-white">{title}</h3>
            <CloseButton onClick={close} />
          </div>

          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            <div>
              <label htmlFor="grp-name" className={lbl}>Group name *</label>
              <input id="grp-name" data-autofocus className={field} value={name} maxLength={120}
                onChange={e => setName(e.target.value)} placeholder="e.g. Flat 402, Goa trip, Sunday cricket" />
            </div>

            <fieldset>
              <legend className={lbl}>Type</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Group type">
                {GROUP_TYPES.map(t => (
                  <button key={t.id} type="button" role="radio" aria-checked={groupType === t.id} onClick={() => pickType(t.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${groupType === t.id
                      ? "bg-[#047857] border-[#047857] text-white" : "border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200"}`}>
                    <span aria-hidden="true">{t.emoji}</span> {t.label}
                  </button>
                ))}
              </div>
              {groupType === "custom" && (
                <div className="mt-2">
                  <label htmlFor="grp-label" className={lbl}>Custom category (optional)</label>
                  <input id="grp-label" className={field} value={groupLabel} maxLength={40}
                    onChange={e => setGroupLabel(e.target.value)} placeholder="e.g. Office lunch club" />
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend className={lbl}>Icon</legend>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Group icon">
                {ICONS.map(ic => (
                  <button key={ic} type="button" role="radio" aria-checked={emoji === ic} aria-label={`Icon ${ic}`}
                    onClick={() => { setEmoji(ic); setEmojiTouched(true); }}
                    className={`w-10 h-10 rounded-xl text-lg cursor-pointer border ${emoji === ic ? "border-[#047857] ring-2 ring-[#047857]/40" : "border-gray-200 dark:border-slate-700"}`}>
                    {ic}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="grp-desc" className={lbl}>Description (optional)</label>
              <input id="grp-desc" className={field} value={description} maxLength={500}
                onChange={e => setDescription(e.target.value)} placeholder="e.g. 10–15 Sep, or monthly flat bills" />
            </div>
            <div>
              <label htmlFor="grp-budget" className={lbl}>Budget in ₹ (optional)</label>
              <input id="grp-budget" className={field} inputMode="decimal" value={budget}
                onChange={e => setBudget(e.target.value)} placeholder="e.g. 20000" />
            </div>

            {mode === "create" ? (
              <fieldset className="space-y-2">
                <legend className={lbl}>People ({people.length + 1} of up to {MAX_PEOPLE}, including you)</legend>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  You ({myName}) are added as the admin. Names are only labels in this group; nobody gets an account or a
                  message. You can invite people to join with a code afterwards.
                </p>
                <ul className="space-y-2">
                  {members.map((m, i) => {
                    const dup = m.trim() && dupes.has(m.trim().toLowerCase());
                    return (
                      <li key={i} className="flex gap-2">
                        <input aria-label={`Person ${i + 2} name`} className={`${field} ${dup ? "border-rose-500" : ""}`} value={m} maxLength={120}
                          onChange={e => setMembers(ms => ms.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder={`Person ${i + 2}`} />
                        <button type="button" aria-label={`Remove person ${i + 2}`} onClick={() => setMembers(ms => ms.filter((_, j) => j !== i))}
                          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-rose-600 cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" disabled={members.length + 1 >= MAX_PEOPLE}
                  onClick={() => setMembers(ms => [...ms, ""])}
                  className="px-3 py-2 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 text-xs font-bold text-[#047857] dark:text-emerald-400 flex items-center gap-1 cursor-pointer disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" /> Add person
                </button>
              </fieldset>
            ) : (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Add, rename, invite or remove people from the <strong>Members</strong> tab. Past expenses and paybacks stay as they are.
              </p>
            )}

            {tried && errors.length > 0 && (
              <ul role="alert" className="text-xs font-semibold text-rose-600 list-disc ml-5 space-y-0.5">
                {errors.map(e => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>

          <div className="flex gap-2 px-6 py-4 border-t border-gray-100 dark:border-slate-800">
            <button type="button" onClick={close}
              className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 text-sm font-bold text-gray-700 dark:text-slate-200 cursor-pointer">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-2.5 bg-[#047857] hover:bg-[#065f46] text-white font-bold text-sm rounded-xl cursor-pointer">
              {mode === "create" ? "Create group" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
