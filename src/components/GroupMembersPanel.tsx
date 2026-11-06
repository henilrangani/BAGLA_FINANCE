/**
 * Group membership: add people, invite them to join with a one-time code (account
 * mode), remove/leave, and join someone else's group with a code. All permission
 * checks are enforced on the server; the buttons shown here only mirror them.
 */
import React, { useState } from "react";
import { Check, Copy, KeyRound, Loader2, LogOut, Share2, UserMinus, UserPlus, X } from "lucide-react";
import type { Group, GroupMember } from "../types";
import {
  claimErrorMessage,
  claimRemoteSeat,
  inviteRemoteMember,
  inviteShareText,
  removeRemoteMember,
} from "../api/groups";
import { CloseButton, Modal } from "./ui/Modal";

interface PanelProps {
  group: Group;
  accountMode: boolean;
  addMember: (groupId: string, name: string, upiId?: string) => Promise<void>;
  refresh: (selectId?: string) => Promise<void>;
}

const VPA = /^[a-zA-Z0-9._-]{1,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export const GroupMemberToolbar: React.FC<PanelProps> = ({ group, accountMode, addMember }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [upi, setUpi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canManage = !accountMode || group.myRole === "admin";
  if (!canManage) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Enter a name."); return; }
    if (upi.trim() && !VPA.test(upi.trim())) { setError("UPI ID must look like name@bank, or leave it empty."); return; }
    setBusy(true);
    try {
      await addMember(group.id, name, upi || undefined);
      setName(""); setUpi(""); setOpen(false);
    } catch (err) {
      setError((err as Error).message || "Couldn't add this person.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs font-bold text-[#047857] hover:underline flex items-center gap-1 cursor-pointer">
        <UserPlus className="w-3.5 h-3.5" /><span>Add Member</span>
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="w-full sm:w-auto flex flex-wrap items-start gap-2" aria-label="Add a member">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" maxLength={120} autoFocus
        aria-label="Member name"
        className="px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-900 dark:text-white" />
      <input value={upi} onChange={e => setUpi(e.target.value)} placeholder="UPI ID (optional)" maxLength={320}
        aria-label="Member UPI ID (optional)"
        className="px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-mono text-gray-900 dark:text-white" />
      <button type="submit" disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-[#047857] text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
        {busy ? "Adding…" : "Add"}
      </button>
      <button type="button" onClick={() => { setOpen(false); setError(""); }}
        className="px-2 py-1.5 text-xs text-gray-500 cursor-pointer">Cancel</button>
      {error && <p role="alert" className="w-full text-[11px] font-semibold text-rose-600">{error}</p>}
    </form>
  );
};

/** Role, joined status and actions for one member card (account mode). */
export const MemberCardActions: React.FC<PanelProps & { member: GroupMember; netRupees: number }> = (
  { group, accountMode, member, netRupees, refresh }) => {
  const [invite, setInvite] = useState<{ token: string; expires_on: string } | null>(null);
  const [busy, setBusy] = useState<"" | "invite" | "remove">("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  if (!accountMode) return null;
  const isAdmin = group.myRole === "admin";

  const makeInvite = async () => {
    setError(""); setBusy("invite");
    try { setInvite(await inviteRemoteMember(group.id, member.id)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };
  const remove = async () => {
    setError("");
    if (netRupees !== 0) {
      setError("Settle this person's balance first; people with money owed can't be removed.");
      return;
    }
    const msg = member.isCurrentUser
      ? `Leave "${group.name}"? You'll lose access to it. Past expenses stay in the group's history.`
      : `Remove ${member.name} from "${group.name}"? ${member.linked ? "They'll lose access to the group. " : ""}Past expenses stay in the history.`;
    if (!window.confirm(msg)) return;
    setBusy("remove");
    try {
      await removeRemoteMember(group.id, member.id);
      await refresh(member.isCurrentUser ? undefined : group.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const share = invite ? inviteShareText(group.name, member.name, invite.token, invite.expires_on) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(share); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Couldn't copy. Select the code and copy it manually."); }
  };

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
        {member.role === "admin" && <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">Admin</span>}
        {member.linked
          ? <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">Joined</span>
          : <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">Not joined yet</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {isAdmin && !member.linked && (
          <button onClick={makeInvite} disabled={busy !== ""}
            className="text-[11px] font-bold text-[#047857] hover:underline flex items-center gap-1 disabled:opacity-60 cursor-pointer">
            {busy === "invite" ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
            {invite ? "New code" : "Invite to join"}
          </button>
        )}
        {(member.isCurrentUser || (isAdmin && !member.isCurrentUser)) && (
          <button onClick={remove} disabled={busy !== ""}
            className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 disabled:opacity-60 cursor-pointer">
            {member.isCurrentUser ? <LogOut className="w-3 h-3" /> : <UserMinus className="w-3 h-3" />}
            {member.isCurrentUser ? "Leave group" : "Remove"}
          </button>
        )}
      </div>
      {invite && (
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 space-y-1.5" role="status">
          <p className="text-[10px] text-gray-500">One-time code for {member.name}. Expires {invite.expires_on}. Making a new code cancels this one.</p>
          <code className="block text-[11px] font-mono break-all select-all text-gray-900 dark:text-white" data-testid="invite-code">{invite.token}</code>
          <div className="flex gap-3">
            <button onClick={copy} className="text-[11px] font-bold text-[#047857] flex items-center gap-1 cursor-pointer">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copied ? "Copied" : "Copy invite"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-bold text-[#047857] flex items-center gap-1">
              <Share2 className="w-3 h-3" />WhatsApp
            </a>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[11px] font-semibold text-rose-600">{error}</p>}
    </div>
  );
};

/** "Join with a code": claims a seat someone reserved for you. */
export const JoinGroupDialog: React.FC<{ onClose: () => void; refresh: (selectId?: string) => Promise<void> }> = (
  { onClose, refresh }) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (code.trim().length < 20) { setError("That doesn't look like a complete code. Copy the whole code and try again."); return; }
    setBusy(true);
    try {
      const r = await claimRemoteSeat(code);
      await refresh(r.group_id);
      onClose();
    } catch (err) {
      setError(claimErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} dirty={!!code.trim() && !busy} labelledBy="join-group-title" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">{close => (<>
      <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-800 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="join-group-title" className="text-base font-black text-gray-900 dark:text-white">Join a group with a code</h3>
          <button type="button" onClick={close} aria-label="Close" className="p-1 text-gray-400 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400">Ask the group admin to tap "Invite to join" next to your name and send you the code. Each code works once.</p>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Paste the code" autoFocus aria-label="Invite code"
          className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-mono text-gray-900 dark:text-white" />
        {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full py-2.5 bg-[#047857] hover:bg-[#065f46] text-white font-bold text-xs rounded-xl disabled:opacity-60 cursor-pointer">
          {busy ? "Joining…" : "Join group"}
        </button>
      </form>
    </>)}</Modal>
  );
};
