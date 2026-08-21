export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const payload = req.body || {};
    console.log("⚡ [LIVE VERCEL SERVERLESS WEBHOOK RECEIVED]:", payload);

    return res.status(200).json({
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
}
