/**
 * Deterministic dashboard coaching line, computed only from this month's
 * recorded figures. Never claims progress the data doesn't show.
 */
import { formatINR, subtractRupees, toPaise } from "./money";

export function coachInsight(
  monthIncome: number,
  monthExpense: number,
  categories: { name: string; amount: number }[] = []
): string {
  const income = toPaise(monthIncome);
  const spend = toPaise(monthExpense);
  const top = [...categories].sort((a, b) => b.amount - a.amount)[0];
  const topText = top && top.amount > 0 ? ` Your biggest category is ${top.name} (${formatINR(top.amount)}).` : "";

  if (income === 0 && spend === 0) {
    return "No income or spending recorded this month yet. Add your first entry to see your savings rate.";
  }
  if (income === 0) {
    return `You've recorded ${formatINR(monthExpense)} of spending this month but no income yet. Add your income to see how much you're saving.${topText}`;
  }
  if (spend > income) {
    return `This month you've spent ${formatINR(subtractRupees(monthExpense, monthIncome))} more than your recorded income.${topText}`;
  }
  const pct = Math.floor(((income - spend) * 1000) / income) / 10; // one decimal, never rounded up
  if (pct < 10) return `You're saving ${pct}% of your recorded income this month. Many people aim for about 20%.${topText}`;
  if (pct < 20) return `You're saving ${pct}% of your recorded income this month, getting close to the common 20% guideline.${topText}`;
  return `You're saving ${pct}% of your recorded income this month, at or above the common 20% guideline.${topText}`;
}
