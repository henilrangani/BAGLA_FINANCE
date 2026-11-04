// Thin Vercel wrapper. Logic, validation and limits live in lib/ai.ts and are
// shared with the local Express server (server.ts).
import { handleChat } from "../../lib/ai";
import { vercelJsonRoute } from "../../lib/vercel";

export default vercelJsonRoute("chat", handleChat);
