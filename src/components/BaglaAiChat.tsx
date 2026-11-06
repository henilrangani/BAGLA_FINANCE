/**
 * Finance assistant. Two honest modes:
 * - "AI": a provider is configured on the server (GET /api/ai/status). The server sends a summary of
 *   this month's data to the provider; answers are labelled as AI-generated and can be wrong.
 * - "Built-in": no provider (or it failed). Answers come from src/utils/insights.ts on this device,
 *   from recorded entries only, with the period and entry count shown.
 * Either way the assistant is advisory: it never creates, edits, voids or settles records and never
 * makes payments. Suggestions only open a screen where the person does it themselves.
 */
import React, { useEffect, useRef, useState } from "react";
import { useFinance } from "../context/FinanceContext";
import { ChevronRight, Loader2, RotateCcw, Send, Sparkles, Square } from "lucide-react";
import { answerFromRecords } from "../utils/insights";
import { CloseButton, Modal } from "./ui/Modal";

type Source = "ai" | "rules" | "error" | "info";
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: Source;
  basis?: string;
  retryOf?: string;
  suggestedActions?: { id: string; label: string; actionType: string; payload?: any }[];
}
type Mode = "checking" | "ai" | "rules";

const CLIENT_TIMEOUT_MS = 25_000;

export const BaglaAiChat: React.FC = () => {
  const { isAiChatOpen, setIsAiChatOpen, askBaglaAi, settings, categories, transactions, budgets,
    setCurrentTab, setIsAddExpenseOpen } = useFinance();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<Mode>("checking");
  const [model, setModel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const hasData = transactions.some(t => t.status !== "soft_deleted");

  // Ask the server whether an AI provider is configured (it never returns the key).
  useEffect(() => {
    if (!isAiChatOpen) return;
    if (settings.offlineMode || !navigator.onLine) { setMode("rules"); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    setMode("checking");
    fetch("/api/ai/status", { signal: ctl.signal })
      .then(r => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : null))
      .then(s => { setMode(s?.configured ? "ai" : "rules"); setModel(s?.model || null); })
      .catch(() => setMode("rules"))
      .finally(() => clearTimeout(t));
    return () => { clearTimeout(t); ctl.abort(); };
  }, [isAiChatOpen, settings.offlineMode]);

  useEffect(() => { if (isAiChatOpen) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading, isAiChatOpen]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { if (isAiChatOpen && !isLoading) inputRef.current?.focus(); }, [isLoading, messages.length, isAiChatOpen]);

  if (!isAiChatOpen) return null;

  const push = (m: Omit<Message, "id">) => setMessages(prev => [...prev, { ...m, id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }]);
  const local = (q: string, note?: string) => {
    const a = answerFromRecords(q, { transactions, categories, budgets });
    push({ role: "assistant", source: "rules", content: (note ? `${note}\n\n` : "") + a.answer, basis: a.basis });
  };

  const send = async (prompt?: string) => {
    const q = (prompt ?? input).trim();
    if (!q || isLoading) return;
    push({ role: "user", content: q });
    setInput("");
    if (mode !== "ai") { local(q); return; }

    setIsLoading(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    const timer = setTimeout(() => ctl.abort("timeout"), CLIENT_TIMEOUT_MS);
    try {
      const history = messages.filter(m => m.source !== "error" && m.source !== "info").slice(-8);
      const r = await askBaglaAi(q, history, ctl.signal);
      if (r?.aiAvailable === false) {
        local(q, "The AI service couldn't answer just now, so this answer comes from your records using built-in rules.");
      } else {
        push({ role: "assistant", source: "ai", content: String(r?.reply || "I don't have enough recorded data to answer that."),
          basis: "AI-generated from this month's totals, budgets, goals, bills, group totals and your 15 most recent entries. It can be wrong; check important figures.",
          suggestedActions: r?.suggestedActions || [] });
      }
    } catch (e) {
      const aborted = ctl.signal.aborted;
      push({ role: "assistant", source: "error", retryOf: q,
        content: aborted
          ? (ctl.signal.reason === "timeout" ? "That took too long, so I stopped waiting. Nothing was changed." : "Stopped. Nothing was changed.")
          : `${(e as Error).message || "Something went wrong."} Nothing was changed.` });
    } finally {
      clearTimeout(timer);
      abortRef.current = null;
      setIsLoading(false);
    }
  };

  // Suggestions only open a screen. The person does the action there (or not).
  const openAction = (a: Message["suggestedActions"] extends (infer T)[] | undefined ? T : never) => {
    setIsAiChatOpen(false);
    if (a.actionType === "open_add_expense") setIsAddExpenseOpen(true);
    else if (a.actionType === "open_budgets") setCurrentTab("budgets");
    else if (a.actionType === "view_group") setCurrentTab("groups");
    else if (a.actionType === "filter_category") setCurrentTab("transactions");
  };

  const samples = ["Where did I spend the most this month?", "How much did I spend on food last month?",
    "Am I over any budget?", "What are my spending patterns?", "How can I spend less?", "What is an EMI?"];

  const banner = mode === "checking"
    ? { tone: "gray", text: "Checking whether AI is set up…" }
    : mode === "ai"
      ? { tone: "indigo", text: `AI is set up on this server${model ? ` (Google Gemini, ${model})` : ""}. Answers are AI-generated suggestions and can be wrong. It can't change your records or make payments.` }
      : { tone: "amber", text: settings.offlineMode || !navigator.onLine
          ? "You're offline, so AI is unavailable. Answers come from your records on this device, using built-in rules."
          : "AI isn't set up on this server (no provider key), so answers come from your records using built-in rules. To enable AI, the server admin sets GEMINI_API_KEY; see ENVIRONMENT.md." };

  return (
    <Modal onClose={() => { abortRef.current?.abort(); setIsAiChatOpen(false); }} dirty={!!input.trim()} labelledBy="ai-title"
      className="fixed inset-0 z-50 flex items-center justify-end p-2 sm:p-4 bg-gray-950/50 backdrop-blur-xs animate-fadeIn">{close => (
      <div className="relative w-full max-w-lg h-[92vh] max-h-[750px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="ai-title" className="font-bold text-sm text-gray-900 dark:text-white">Bagla AI Assistant</h3>
                <span data-testid="ai-mode" className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${mode === "ai"
                  ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300" : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"}`}>
                  {mode === "ai" ? "AI" : mode === "checking" ? "…" : "Built-in rules"}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Advisory only · never changes your records</p>
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <p role="status" data-testid="ai-banner" className={`px-5 py-2.5 text-[11px] font-medium border-b ${
          banner.tone === "indigo" ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border-indigo-100 dark:border-indigo-900"
          : banner.tone === "amber" ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-100 dark:border-amber-900"
          : "bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-100 dark:border-slate-800"}`}>
          {banner.text}
        </p>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs" aria-live="polite">
          {messages.length === 0 && (
            <div className="text-gray-600 dark:text-slate-300 space-y-2" data-testid="ai-empty">
              <p className="font-semibold">Ask about your recorded spending, budgets or a money term.</p>
              {!hasData && <p>You have no entries yet, so there's nothing to analyse. Add an expense or import a statement first; I can still explain terms like EMI or SIP.</p>}
              <p className="text-gray-500 dark:text-slate-400">I can't see bank accounts, make payments or change entries.</p>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div data-testid={m.role === "assistant" ? `ai-answer-${m.source}` : undefined}
                className={`max-w-[88%] p-3.5 rounded-3xl leading-relaxed ${m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-xs font-medium"
                  : m.source === "error" ? "bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border border-rose-200 dark:border-rose-900 rounded-bl-xs"
                  : "bg-[#F2F4F7] dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-bl-xs"}`}>
                {m.role === "assistant" && m.source !== "error" && (
                  <span className="block text-[9px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1">
                    {m.source === "ai" ? "AI answer" : "From your records (no AI)"}
                  </span>
                )}
                <div className="whitespace-pre-wrap">{m.content.replace(/\*\*/g, "")}</div>
                {m.basis && <p className="mt-2 text-[10px] text-gray-500 dark:text-slate-400">{m.basis}</p>}
                {m.retryOf && (
                  <button onClick={() => send(m.retryOf)} disabled={isLoading}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:underline cursor-pointer">
                    <RotateCcw className="w-3 h-3" /> Try again
                  </button>
                )}
                {!!m.suggestedActions?.length && (
                  <div className="mt-3 pt-2.5 border-t border-gray-200 dark:border-slate-700 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Open (you decide what to do there)</span>
                    {m.suggestedActions.map(a => (
                      <button key={a.id} onClick={() => openAction(a)}
                        className="w-full text-left px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-2xl font-bold flex items-center justify-between cursor-pointer">
                        <span>{a.label}</span><ChevronRight className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400" role="status">
              <Loader2 className="w-4 h-4 animate-spin" /> <span>Waiting for the AI service…</span>
              <button onClick={() => abortRef.current?.abort()}
                className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-300 dark:border-slate-600 text-[11px] font-bold text-gray-700 dark:text-slate-200 cursor-pointer">
                <Square className="w-3 h-3" /> Stop
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-800 overflow-x-auto flex gap-2">
          {samples.map(q => (
            <button key={q} onClick={() => send(q)} disabled={isLoading || mode === "checking"}
              className="whitespace-nowrap text-[11px] px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 font-semibold cursor-pointer disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>

        <form onSubmit={e => { e.preventDefault(); send(); }} className="p-3.5 border-t border-gray-200 dark:border-slate-800 flex items-center gap-2.5">
          <input ref={inputRef} aria-label="Ask a question" value={input} onChange={e => setInput(e.target.value)} maxLength={2000}
            placeholder="e.g. How much did I spend on food last month?" disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="submit" aria-label="Send" disabled={isLoading || mode === "checking" || !input.trim()}
            className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl cursor-pointer">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    )}</Modal>
  );
};
