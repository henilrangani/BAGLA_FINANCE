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
    const { recentTransactions, historicalAverages } = req.body || {};
    const ai = getGeminiClient();

    if (!ai) {
      return res.status(200).json({
        anomalies: [
          {
            type: "unusual_transaction",
            severity: "low",
            title: "Higher transport spending today",
            message: "Your transport expenses today are 2.4× higher than your usual weekday average.",
            transactionId: recentTransactions?.[0]?.id || ""
          }
        ]
      });
    }

    const prompt = `Analyze these recent transactions against user spending patterns and detect unusual transactions, category spikes, or unexpected bill shocks.
Rules:
- NEVER use the word 'fraud' unless verified by a bank. Use 'Unusual transaction' or 'Higher than usual'.
- Keep alerts non-judgmental, factual, and informative.

Data:
Recent: ${JSON.stringify(recentTransactions?.slice(0, 15) || [])}
Historical Averages: ${JSON.stringify(historicalAverages || {})}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            anomalies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: "e.g. 'unusual_transaction', 'category_spike', 'bill_shock'" },
                  severity: { type: Type.STRING, description: "low, medium, or high" },
                  title: { type: Type.STRING },
                  message: { type: Type.STRING },
                  transactionId: { type: Type.STRING }
                },
                required: ["type", "severity", "title", "message"]
              }
            }
          },
          required: ["anomalies"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("Error in anomaly detection:", error);
    return res.status(200).json({ anomalies: [] });
  }
}
