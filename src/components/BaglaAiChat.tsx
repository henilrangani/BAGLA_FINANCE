import React, { useState, useRef, useEffect } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Check,
  ChevronRight,
  TrendingDown,
  Calendar,
  CreditCard,
  PieChart,
  Users
} from "lucide-react";
import { localDateString } from "../utils/dates";
import { formatINR, safeRupees } from "../utils/money";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestedActions?: {
    id: string;
    label: string;
    actionType: string;
    payload?: any;
  }[];
}

export const BaglaAiChat: React.FC = () => {
  const {
    isAiChatOpen,
    setIsAiChatOpen,
    askBaglaAi,
    addBudget,
    addTransaction,
    settings,
    categories
  } = useFinance();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "msg-welcome",
      role: "assistant",
      content: `Hello${settings.name ? ` ${settings.name.split(" ")[0]}` : ""}! I am **Bagla AI**, your personal financial assistant.

I have direct access to your recorded transactions, budgets, subscriptions, and Goa group trip balances. 

Ask me anything about where your money went, who owes you what, or simulate monthly savings.`
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isAiChatOpen) {
      scrollToBottom();
    }
  }, [messages, isAiChatOpen]);

  if (!isAiChatOpen) return null;

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = customPrompt || input;
    if (!promptToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: promptToSend
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await askBaglaAi(promptToSend, messages);
      const assistantMsg: Message = {
        id: `msg-ai-${Date.now()}`,
        role: "assistant",
        content: result.reply,
        suggestedActions: result.suggestedActions || []
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          role: "assistant",
          content: "I ran into a temporary error while querying your data. All your financial records are safe. Feel free to re-ask."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // AI suggestions only take effect when the user clicks them, and never with
  // an invented amount: a missing or invalid amount is refused.
  const handleExecuteAction = (action: any) => {
    const amount = Math.abs(safeRupees(action?.payload?.amount));
    const say = (content: string) =>
      setMessages(prev => [...prev, { id: `msg-act-${Date.now()}`, role: "assistant", content }]);
    if ((action.actionType === "create_budget" || action.actionType === "add_expense") && !(amount > 0)) {
      say("I couldn't tell the amount for that. Please tell me the exact amount, or add it manually.");
      return;
    }
    const wantedCat = String(action?.payload?.category || "").trim().toLowerCase();
    const matchedCat =
      (wantedCat && categories.find(c => c.name.toLowerCase() === wantedCat || c.name.toLowerCase().includes(wantedCat))) ||
      categories.find(c => c.id === "cat-other") ||
      categories[0];

    if (action.actionType === "create_budget") {
      addBudget({
        name: `Budget for ${matchedCat.name}`,
        type: "category",
        categoryId: matchedCat.id,
        amount,
        period: "monthly",
        alertThreshold: 0.8,
        startDate: `${localDateString().slice(0, 7)}-01`
      });
      say(`✓ **Created Budget**: ${formatINR(amount)} monthly budget for ${matchedCat.name}.`);
    } else if (action.actionType === "add_expense") {
      const result = addTransaction({
        amount,
        type: "expense",
        currency: "INR",
        merchant: String(action.payload?.merchant || "Expense").slice(0, 80),
        description: String(action.payload?.merchant || "Added via Bagla AI").slice(0, 120),
        categoryId: matchedCat.id,
        date: localDateString(),
        time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        paymentMethod: "upi",
        source: "manual",
        status: "verified",
        confidence: 1.0,
        tags: ["ai-suggested", "user-confirmed"]
      });
      say(
        result.success
          ? `✓ **Recorded Expense**: ${formatINR(amount)} in ${matchedCat.name}.${result.duplicateWarning ? " (Flagged as a possible duplicate.)" : ""}`
          : "That expense couldn't be saved. Please add it manually."
      );
    }
  };

  const sampleQuestions = [
    "Where did I spend the most this month?",
    "Who owes me money from Goa trip?",
    "What are my monthly recurring subscriptions?",
    "How much did I spend on Food & Dining?",
    "Simulate: what if I reduce food spending by 20%?"
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-2 sm:p-4 bg-gray-950/50 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg h-[92vh] max-h-[750px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Bagla AI Assistant</h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  Live
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Grounded in your financial records</p>
            </div>
          </div>
          <button
            onClick={() => setIsAiChatOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px] border border-indigo-200/60 dark:border-indigo-800/60">
                  AI
                </div>
              )}
              <div
                className={`max-w-[85%] p-4 rounded-3xl leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-xs shadow-md shadow-indigo-600/20 font-medium"
                    : "bg-[#F2F4F7] dark:bg-slate-800 text-gray-800 dark:text-slate-200 rounded-bl-xs border border-gray-200 dark:border-slate-700"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Suggested Action Buttons if any */}
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-gray-200 dark:border-slate-700 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Proposed Action:
                    </span>
                    {msg.suggestedActions.map(action => (
                      <button
                        key={action.id}
                        onClick={() => handleExecuteAction(action)}
                        className="w-full text-left px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-2xl font-bold flex items-center justify-between hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors shadow-xs cursor-pointer"
                      >
                        <span>{action.label}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-2xl bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                  You
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2.5 items-center text-gray-400 text-xs italic">
              <div className="w-7 h-7 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
              </div>
              <span className="font-medium">Bagla AI is querying your financial data...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/50 dark:bg-slate-800/30 overflow-x-auto flex gap-2 scrollbar-none">
          {sampleQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(q)}
              disabled={isLoading}
              className="whitespace-nowrap text-[11px] px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200/80 dark:border-slate-700 transition-colors shadow-2xs font-semibold cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3.5 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about spending, who owes you, budgets..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl shadow-md shadow-indigo-600/25 transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
