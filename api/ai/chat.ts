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
    const { message, financialData, conversationHistory = [] } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      const spent = financialData?.monthlyStats?.totalSpent;
      const spentStr = typeof spent === "number" && spent > 0 ? `₹${spent.toLocaleString("en-IN")}` : null;
      const reply = spentStr
        ? `Based on your recorded data: You have logged expenses totaling ${spentStr} this month. How can I help you manage your budgets or review your spending today?`
        : "I am ready to help manage your finances. You can ask me to track expenses, review your budgets, or analyze spending once transactions are recorded.";

      return res.status(200).json({
        reply,
        suggestedActions: []
      });
    }

    const systemPrompt = `You are "Bagla AI", the intelligent, calm, non-judgmental, and helpful financial assistant for BAGLA FINANCE ("Every Rupee. Clearly Managed.").

FINANCIAL SAFETY & COMPLIANCE RULES:
1. NEVER provide regulated investment advice, stock trading tips, credit score approvals, or loan guarantees.
2. Base all your responses STRICTLY on the user's provided financial data context.
3. If specific requested information is missing from the provided data, clearly say: "I don't have enough recorded data to answer that."
4. Maintain a supportive, respectful, non-judgmental tone. Never scold or shame the user for overspending.
5. All monetary amounts should be formatted in Indian Rupees (₹) with Indian numbering style (e.g. ₹1,20,000).
6. If the user asks you to perform an action (e.g., "Create a ₹10,000 monthly food budget" or "Add ₹850 dinner"), generate a structured action suggestion in the response with action type, parameters, and require user confirmation.

CURRENT USER FINANCIAL CONTEXT:
${JSON.stringify(financialData, null, 2)}
`;

    const formattedContents = [
      { role: "user", parts: [{ text: `System Context:\n${systemPrompt}` }] },
      ...conversationHistory.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content || m.text }]
      })),
      { role: "user", parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: formattedContents as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: "Helpful, conversational, grounded markdown reply" },
            suggestedActions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  actionType: { type: Type.STRING, description: "e.g., 'create_budget', 'add_expense', 'view_group', 'filter_category'" },
                  payload: {
                    type: Type.OBJECT,
                    properties: {
                      amount: { type: Type.NUMBER },
                      category: { type: Type.STRING },
                      merchant: { type: Type.STRING },
                      period: { type: Type.STRING },
                      groupId: { type: Type.STRING }
                    }
                  }
                },
                required: ["id", "label", "actionType"]
              }
            }
          },
          required: ["reply"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("Error in ai chat:", error);
    return res.status(200).json({
      reply: "I encountered a minor network issue while processing that. However, all your recorded financial data is safe. Could you repeat your question?",
      suggestedActions: []
    });
  }
}
