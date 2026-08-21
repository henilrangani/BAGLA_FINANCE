import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { todayTransactions, dailyBudget, averageDailySpend, date } = req.body || {};
    const ai = getGeminiClient();

    const totalToday = (todayTransactions || []).reduce((acc: number, t: any) => acc + (t.amount || 0), 0);
    const categoryTotals: Record<string, number> = {};
    for (const t of (todayTransactions || [])) {
      categoryTotals[t.category || "Other"] = (categoryTotals[t.category || "Other"] || 0) + (t.amount || 0);
    }

    if (!ai) {
      return res.status(200).json({
        totalSpent: totalToday,
        transactionCount: (todayTransactions || []).length,
        topCategories: Object.entries(categoryTotals)
          .map(([k, v]) => ({ name: k, amount: v }))
          .sort((a, b) => b.amount - a.amount),
        comparedToAveragePercent: averageDailySpend ? Math.round(((totalToday - averageDailySpend) / averageDailySpend) * 100) : 0,
        remainingDailyBudget: Math.max(0, (dailyBudget || 2000) - totalToday),
        aiInsight: `You recorded ${(todayTransactions || []).length} transactions today totaling ₹${totalToday.toLocaleString('en-IN')}. Good job keeping track of your expenses.`
      });
    }

    const prompt = `Generate a calm, encouraging, and clear daily expense summary for Bagla Finance.
Data for today (${date || "Today"}):
- Total Spent: ₹${totalToday}
- Transactions count: ${(todayTransactions || []).length}
- Breakdown: ${JSON.stringify(categoryTotals)}
- Daily Budget Target: ₹${dailyBudget || 2000}
- Average Daily Spend: ₹${averageDailySpend || 1500}

Provide structured output with friendly, helpful, non-judgmental AI insight explaining what contributed most today.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            totalSpent: { type: Type.NUMBER },
            transactionCount: { type: Type.NUMBER },
            topCategories: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  amount: { type: Type.NUMBER }
                },
                required: ["name", "amount"]
              }
            },
            comparedToAveragePercent: { type: Type.NUMBER },
            remainingDailyBudget: { type: Type.NUMBER },
            aiInsight: { type: Type.STRING }
          },
          required: ["totalSpent", "transactionCount", "topCategories", "aiInsight"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("Error in daily summary:", error);
    return res.status(500).json({ error: "Failed to generate daily summary" });
  }
}
