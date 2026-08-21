import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(200).json(fallbackReceiptScan());
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
    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("Error in scan-receipt:", error);
    return res.status(200).json(fallbackReceiptScan());
  }
}
