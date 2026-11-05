/** Family Space API (account mode). All amounts are integer paise; access is enforced by the server. */
import { ApiError, api } from "./client";

export type FamilyRole = "admin" | "adult" | "child" | "viewer";

export interface FamilyListItem { id: string; name: string; my_role: FamilyRole }
export interface FamilyMemberView { member_id: string; user_id: string; name: string; role: FamilyRole }
export interface FamilyDetail { id: string; name: string; my_role: FamilyRole; members: FamilyMemberView[] }
export interface FamilyGoalView {
  id: string; name: string; target_paise: number; target_date: string | null; status: string;
  saved_paise: number; remaining_paise: number;
  by_member: { member: string; mine: boolean; amount_paise: number }[];
  contributions: { id: string; member: string; mine: boolean; amount_paise: number; note: string | null; contributed_on: string }[];
}
export interface FamilySummary {
  family: { id: string; name: string; my_role: FamilyRole };
  period: { start: string; end_exclusive: string };
  shared_spend_paise: number;
  by_member: { member: string; mine: boolean; spend_paise: number; entries: number }[];
  by_category: { category: string; spend_paise: number }[];
  budgets: { id: string; name: string; category: string | null; limit_paise: number; spent_paise: number;
    remaining_paise: number; over: boolean }[];
  goals: FamilyGoalView[];
  my_shared_entries: number;
}
export interface FamilyActivity { at: string; actor: string; mine: boolean; action: string; label: string;
  details: Record<string, unknown> }

const F = "/api/v1/families";
export const listFamilies = () => api<FamilyListItem[]>("GET", F);
export const getFamily = (id: string) => api<FamilyDetail>("GET", `${F}/${id}`);
export const getSummary = (id: string, month: string) => api<FamilySummary>("GET", `${F}/${id}/summary?month=${month}`);
export const getActivity = (id: string) => api<FamilyActivity[]>("GET", `${F}/${id}/activity`);
export const createFamily = (name: string) => api<{ id: string }>("POST", F, { name: name.trim().slice(0, 120) });
export const inviteToFamily = (id: string, role: FamilyRole) =>
  api<{ token: string; role: FamilyRole; expires_at: string }>("POST", `${F}/${id}/invites`, { role });
export const acceptFamilyInvite = (token: string) =>
  api<{ family_id: string; role: FamilyRole }>("POST", `${F}/invites/accept`, { token: token.trim() });
export const removeFamilyMember = (id: string, memberId: string) => api("DELETE", `${F}/${id}/members/${memberId}`);
export const changeFamilyRole = (id: string, memberId: string, role: FamilyRole) =>
  api("PATCH", `${F}/${id}/members/${memberId}`, { role });
export const addFamilyBudget = (id: string, name: string, limitPaise: number, category: string | null) =>
  api("POST", `${F}/${id}/budgets`, { name: name.trim().slice(0, 120), limit_paise: limitPaise, category });
export const archiveFamilyBudget = (id: string, budgetId: string) =>
  api("PATCH", `${F}/${id}/budgets/${budgetId}`, { is_archived: true });
export const addFamilyGoal = (id: string, name: string, targetPaise: number, targetDate?: string) =>
  api("POST", `${F}/${id}/goals`, { name: name.trim().slice(0, 120), target_paise: targetPaise, target_date: targetDate || undefined });
export const setFamilyGoalStatus = (id: string, goalId: string, status: "active" | "completed" | "archived") =>
  api("PATCH", `${F}/${id}/goals/${goalId}`, { status });
export const contributeToGoal = (id: string, goalId: string, amountPaise: number, idempotencyKey: string, note?: string) =>
  api("POST", `${F}/${id}/goals/${goalId}/contributions`, { amount_paise: amountPaise, idempotency_key: idempotencyKey, note });
export const voidContribution = (id: string, goalId: string, cid: string) =>
  api("DELETE", `${F}/${id}/goals/${goalId}/contributions/${cid}`);
export const shareEntry = (txId: string, familyId: string | null) =>
  api("POST", `${F}/share/${txId}`, { family_id: familyId });
export const unshareAllMine = (id: string) => api<{ unshared: number }>("POST", `${F}/${id}/unshare-mine`);

export const ROLE_INFO: Record<FamilyRole, string> = {
  admin: "Admin: invites and removes people, changes roles, manages budgets and goals",
  adult: "Adult: shares own entries, manages budgets and goals, contributes",
  child: "Child: shares own entries and contributes to goals",
  viewer: "Viewer: sees what others shared; can't share or change anything",
};

export function familyErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 400) return "This invite is invalid, already used or expired. Ask the family admin for a new one.";
    if (e.status === 403) return "Your family role doesn't allow this.";
    if (e.status === 404) return "Not found, or you're no longer a member of this family.";
    return e.message;
  }
  return (e as Error)?.message || "Something went wrong. Please try again.";
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}
