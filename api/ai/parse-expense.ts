import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

function fallbackParseExpense(text: string) {
  const lower = text.toLowerCase();
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text prompt is required" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(200).json(fallbackParseExpense(text));
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
    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("Error in parse-expense:", error);
    return res.status(200).json(fallbackParseExpense(req.body?.text || ""));
  }
}
