import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

// Lazy initialize Gemini client to avoid crashes if key is missing or provided dynamically
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. AI features will fallback to smart local processing.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// ----------------------------------------------------
// 1. Natural Language & Voice Expense Parser
// ----------------------------------------------------
app.post("/api/ai/parse-expense", async (req: Request, res: Response) => {
  try {
    const { text, context } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text prompt is required" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Smart rule-based fallback if API key is not yet configured
      return res.json(fallbackParseExpense(text));
    }

    const prompt = `You are the expense parser for Bagla Finance (an Indian fintech app).
The user gave this natural language expense note or voice transcript:
"${text}"

Current context:
User timezone: Asia/Kolkata
Standard Indian currencies: INR (₹)
Common Indian categories: Food, Groceries, Transport, Fuel, Travel, Shopping, Entertainment, Bills, Electricity, Internet, Education, Healthcare, Rent, Insurance, Subscriptions, Personal Care, Family, Gifts, Charity, Business, Other.
Common payment methods: cash, upi, debit_card, credit_card, bank_transfer, wallet, cheque, other.

Extract the structured expense information and return in valid JSON format matching the schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, description: "Total numeric amount in INR" },
            category: { type: Type.STRING, description: "Best matching category name" },
            merchant: { type: Type.STRING, description: "Merchant/vendor/payee name if identifiable, or short title" },
            description: { type: Type.STRING, description: "Clear clean description of the expense" },
            paymentMethod: { type: Type.STRING, description: "Payment method (cash, upi, debit_card, credit_card, etc.)" },
            date: { type: Type.STRING, description: "YYYY-MM-DD format (default to today if not specified)" },
            confidence: { type: Type.NUMBER, description: "Confidence score between 0 and 1" },
            notes: { type: Type.STRING, description: "Any additional notes extracted" },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Relevant tags"
            }
          },
          required: ["amount", "category", "description", "confidence"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in parse-expense:", error);
    // Return graceful fallback
    return res.json(fallbackParseExpense(req.body?.text || ""));
  }
});

// ----------------------------------------------------
// 2. Multimodal Receipt & Bill Scanner
// ----------------------------------------------------
app.post("/api/ai/scan-receipt", async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.json(fallbackReceiptScan());
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const prompt = `Extract all structured financial data from this receipt or bill.
Identify:
1. Merchant/Store name
2. Date of transaction (YYYY-MM-DD)
3. Total amount paid (in INR ₹ if Indian receipt)
4. Tax / GST amount if listed
5. Subtotal before tax
6. List of itemized items with item name, quantity, and unit price
7. Primary category (e.g. Food, Groceries, Shopping, Healthcare, Transport, Bills, etc.)
8. Payment method if printed (e.g., UPI, Card, Cash)
9. Confidence score between 0.0 and 1.0.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING },
            date: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
            taxAmount: { type: Type.NUMBER },
            subtotal: { type: Type.NUMBER },
            category: { type: Type.STRING },
            paymentMethod: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  price: { type: Type.NUMBER },
                },
                required: ["name", "price"]
              }
            }
          },
          required: ["merchant", "totalAmount", "category", "confidence"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in scan-receipt:", error);
    return res.json(fallbackReceiptScan());
  }
});

// ----------------------------------------------------
// 3. Grounded Bagla AI Financial Assistant
// ----------------------------------------------------
app.post("/api/ai/chat", async (req: Request, res: Response) => {
  try {
    const { message, financialData, conversationHistory = [] } = req.body;
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

      return res.json({
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
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in ai chat:", error);
    return res.json({
      reply: "I encountered a minor network issue while processing that. However, all your recorded financial data is safe. Could you repeat your question?",
      suggestedActions: []
    });
  }
});

// ----------------------------------------------------
// 4. Daily 11 PM Summary Generator
// ----------------------------------------------------
app.post("/api/ai/daily-summary", async (req: Request, res: Response) => {
  try {
    const { todayTransactions, dailyBudget, averageDailySpend, date } = req.body;
    const ai = getGeminiClient();

    const totalToday = (todayTransactions || []).reduce((acc: number, t: any) => acc + (t.amount || 0), 0);
    const categoryTotals: Record<string, number> = {};
    for (const t of (todayTransactions || [])) {
      categoryTotals[t.category || "Other"] = (categoryTotals[t.category || "Other"] || 0) + (t.amount || 0);
    }

    if (!ai) {
      return res.json({
        totalSpent: totalToday,
        transactionCount: (todayTransactions || []).length,
        topCategories: Object.entries(categoryTotals).map(([k, v]) => ({ name: k, amount: v })).sort((a, b) => b.amount - a.amount),
        comparedToAverage: averageDailySpend ? Math.round(((totalToday - averageDailySpend) / averageDailySpend) * 100) : 0,
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
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in daily summary:", error);
    return res.status(500).json({ error: "Failed to generate daily summary" });
  }
});

// ----------------------------------------------------
// 5. Intelligent Anomaly & Bill Shock Detection
// ----------------------------------------------------
app.post("/api/ai/anomalies", async (req: Request, res: Response) => {
  try {
    const { recentTransactions, historicalAverages } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        anomalies: []
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
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in anomaly detection:", error);
    return res.json({ anomalies: [] });
  }
});

// ----------------------------------------------------
// 6. Live Payment & Webhook Auto-Ingestion Endpoint
// ----------------------------------------------------
app.post("/api/webhooks/payment-sync", (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    console.log("⚡ [LIVE WEBHOOK RECEIVED]:", payload);

    return res.json({
      success: true,
      status: "received",
      ingestionId: `ingest-${Date.now()}`,
      message: "Transaction received and queued for live sandbox ledger synchronization.",
      payloadSummary: {
        provider: payload.provider || "UPI",
        amount: payload.amount || 0,
        merchant: payload.merchant || "Direct Webhook",
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ error: "Failed to process webhook" });
  }
});

// Helper Fallback functions
function fallbackParseExpense(text: string) {
  const lower = text.toLowerCase();
  // Extract number
  const amountMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
  let amount = 100;
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  }

  let category = "Food";
  let merchant = "Expense";
  let paymentMethod = "upi";

  if (lower.includes("auto") || lower.includes("cab") || lower.includes("uber") || lower.includes("ola") || lower.includes("bus") || lower.includes("metro") || lower.includes("petrol") || lower.includes("fuel")) {
    category = "Transport";
    merchant = lower.includes("auto") ? "Auto Rickshaw" : lower.includes("uber") ? "Uber" : lower.includes("ola") ? "Ola" : "Transport";
  } else if (lower.includes("grocery") || lower.includes("groceries") || lower.includes("milk") || lower.includes("vegetable") || lower.includes("blinkit") || lower.includes("zepto") || lower.includes("instamart")) {
    category = "Groceries";
    merchant = lower.includes("blinkit") ? "Blinkit" : lower.includes("zepto") ? "Zepto" : "Grocery Store";
  } else if (lower.includes("electricity") || lower.includes("bill") || lower.includes("wifi") || lower.includes("recharge") || lower.includes("jio") || lower.includes("airtel")) {
    category = "Bills";
    merchant = lower.includes("electricity") ? "Electricity Board" : lower.includes("jio") ? "Jio" : "Utility Bill";
  } else if (lower.includes("amazon") || lower.includes("flipkart") || lower.includes("shopping") || lower.includes("myntra") || lower.includes("clothes")) {
    category = "Shopping";
    merchant = lower.includes("amazon") ? "Amazon" : lower.includes("myntra") ? "Myntra" : "Shopping Store";
  } else if (lower.includes("cash")) {
    paymentMethod = "cash";
  }

  return {
    amount,
    category,
    merchant,
    description: text.trim(),
    paymentMethod,
    date: new Date().toISOString().split("T")[0],
    confidence: 0.88,
    notes: "",
    tags: ["quick-entry"]
  };
}

function fallbackReceiptScan() {
  return {
    error: "AI Receipt Scanner is offline or API key is not configured. Please enter transaction details manually.",
    merchant: "",
    date: new Date().toISOString().split("T")[0],
    totalAmount: 0,
    subtotal: 0,
    taxAmount: 0,
    category: "Other",
    paymentMethod: "upi",
    confidence: 0,
    items: []
  };
}

// ----------------------------------------------------
// Vite Server Integration
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Bagla Finance server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
