// Thin Vercel wrapper. Logic, validation and limits live in lib/ai.ts and are
// shared with the local Express server (server.ts).
import { handleParseExpense } from "../../lib/ai";
import { vercelJsonRoute } from "../../lib/vercel";

export default vercelJsonRoute("parse-expense", handleParseExpense);
