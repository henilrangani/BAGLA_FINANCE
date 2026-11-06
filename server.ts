/**
 * Local Express server: serves the Vite app and the /api routes.
 * Route logic lives in lib/ (shared with the Vercel functions in api/).
 */
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  aiStatus,
  handleAnomalies,
  handleChat,
  handleDailySummary,
  handleParseExpense,
  handleScanReceipt,
  HandlerResult,
} from "./lib/ai";
import { API_HEADERS, LIMITS, LimitName, clientIp, isAllowedOrigin, isJsonRequest, securityHeaders } from "./lib/security";
import { MAX_WEBHOOK_BYTES, SIGNATURE_HEADER, handlePaymentWebhook } from "./lib/webhook";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3000;
// Bind to localhost by default; set HOST=0.0.0.0 only when you intend to expose it.
const HOST = process.env.HOST || "127.0.0.1";
// Only trust X-Forwarded-For when actually running behind a reverse proxy.
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

const app = express();
app.disable("x-powered-by");
if (TRUST_PROXY) app.set("trust proxy", 1);

// Security headers on every response.
app.use((_req, res, next) => {
  res.set(securityHeaders(isProduction));
  next();
});

// Webhook needs the exact raw bytes for HMAC verification, so it is mounted
// before the JSON parser.
app.post(
  "/api/webhooks/payment-sync",
  express.raw({ type: "*/*", limit: MAX_WEBHOOK_BYTES }),
  (req: Request, res: Response) => {
    res.set(API_HEADERS);
    const ip = clientIp(req.headers, req.socket.remoteAddress, TRUST_PROXY);
    const wait = LIMITS.webhook.check(`webhook:${ip}`);
    if (wait > 0) return res.status(429).set("Retry-After", String(wait)).json({ error: "Too many requests" });
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const result = handlePaymentWebhook(raw, req.get(SIGNATURE_HEADER));
    return res.status(result.status).json(result.body);
  }
);

// JSON bodies: 6 MB covers a 4 MB receipt image after base64 encoding.
app.use("/api", express.json({ limit: "6mb" }));

function jsonRoute(limit: LimitName, handler: (body: any) => Promise<HandlerResult>) {
  return async (req: Request, res: Response) => {
    res.set(API_HEADERS);
    if (!isAllowedOrigin(req.headers, allowedOrigins)) return res.status(403).json({ error: "Cross-origin request blocked" });
    if (!isJsonRequest(req.headers)) return res.status(415).json({ error: "Content-Type must be application/json" });
    const ip = clientIp(req.headers, req.socket.remoteAddress, TRUST_PROXY);
    const wait = LIMITS[limit].check(`${limit}:${ip}`);
    if (wait > 0) {
      return res.status(429).set("Retry-After", String(wait)).json({ error: "Too many requests. Please wait and try again." });
    }
    try {
      const result = await handler(req.body ?? {});
      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error(`${limit} handler error:`, (err as Error)?.message);
      return res.status(500).json({ error: "Internal error" });
    }
  };
}

app.get("/api/ai/status", (_req, res) => { res.set(API_HEADERS).json(aiStatus()); });
app.post("/api/ai/parse-expense", jsonRoute("parse-expense", handleParseExpense));
app.post("/api/ai/scan-receipt", jsonRoute("scan-receipt", handleScanReceipt));
app.post("/api/ai/chat", jsonRoute("chat", handleChat));
app.post("/api/ai/daily-summary", jsonRoute("daily-summary", handleDailySummary));
app.post("/api/ai/anomalies", jsonRoute("anomalies", handleAnomalies));

// Unknown API routes / wrong methods: JSON 404 instead of the SPA page.
app.all("/api/*", (_req, res) => {
  res.set(API_HEADERS).status(404).json({ error: "Not found" });
});

// Body-parser errors (too large, malformed JSON) -> clean JSON errors, no stack traces.
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (!err) return next();
  const status = err.type === "entity.too.large" ? 413 : err.type === "entity.parse.failed" ? 400 : 500;
  if (status === 500) console.error("Unhandled error:", err?.message);
  res.status(status).json({ error: status === 413 ? "Request body too large" : status === 400 ? "Malformed JSON" : "Internal error" });
});

async function startServer() {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set: AI routes will use deterministic fallbacks.");
  }
  if (!process.env.WEBHOOK_SECRET) {
    console.warn("WEBHOOK_SECRET is not set: /api/webhooks/payment-sync is disabled.");
  }

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false, maxAge: "1h" }));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Bagla Finance server running on http://${HOST}:${PORT}`);
  });
}

startServer();
