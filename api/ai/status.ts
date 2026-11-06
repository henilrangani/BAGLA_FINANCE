// Thin Vercel wrapper: whether an AI provider is configured on the server (never the key).
import { aiStatus } from "../../lib/ai";
import { API_HEADERS, securityHeaders } from "../../lib/security";

export default function status(req: any, res: any) {
  for (const [k, v] of Object.entries({ ...securityHeaders(true), ...API_HEADERS })) res.setHeader(k, v);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed. Use GET." });
  return res.status(200).json(aiStatus());
}
