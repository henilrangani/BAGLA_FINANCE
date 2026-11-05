/** Recurring-bill maths shared by the device and account screens. Integer paise in, integer paise out. */
export const PER_MONTH: Record<string, number> = {
  daily: 365 / 12, weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12,
};

/** Monthly equivalent of a set of bills, rounded to the paisa once, at the end. */
export function monthlyPaise(items: { amountPaise: number; frequency: string }[]): number {
  return Math.round(items.reduce((s, i) => s + i.amountPaise * (PER_MONTH[i.frequency] ?? 1), 0));
}
