import React, { useState, useEffect, useRef } from "react";
import { useFinance } from "../context/FinanceContext";
import { Mic, MicOff, X, Sparkles, Check, RefreshCw, Volume2, AlertCircle } from "lucide-react";
import { PaymentMethod } from "../types";

export const VoiceExpenseModal: React.FC = () => {
  const {
    isVoiceModalOpen,
    setIsVoiceModalOpen,
    categories,
    addTransaction,
    parseNaturalLanguageExpense,
    settings
  } = useFinance();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isVoiceModalOpen) {
      setTranscript("");
      setExtractedData(null);
      setIsListening(false);
      setErrorMessage(null);
      setSavedSuccess(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      return;
    }

    // Initialize Web Speech API if supported
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-IN"; // English (India)

      recognition.onresult = (event: any) => {
        let currentTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error !== "no-speech") {
          setErrorMessage(`Mic error (${event.error}). You can also type or use sample audio prompts.`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setErrorMessage("Live microphone speech recognition is not supported in this browser. You can select sample voice phrases below.");
    }
  }, [isVoiceModalOpen]);

  if (!isVoiceModalOpen) return null;

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setErrorMessage("Speech recognition not available. Please click a sample phrase below.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setErrorMessage(null);
      setTranscript("");
      setExtractedData(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err: any) {
        console.error("Start error", err);
        setErrorMessage("Microphone access failed. Ensure mic permissions are allowed.");
      }
    }
  };

  const handleProcessTranscript = async (textToProcess?: string) => {
    const text = textToProcess || transcript;
    if (!text.trim()) return;

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const result = await parseNaturalLanguageExpense(text);
      setExtractedData(result);
    } catch (err) {
      console.error(err);
      setErrorMessage("Could not parse audio. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSave = () => {
    if (!extractedData) return;

    const matchedCategory = categories.find(
      c => c.name.toLowerCase() === (extractedData.category || "").toLowerCase()
    ) || categories[0];

    addTransaction({
      amount: Number(extractedData.amount) || 100,
      type: "expense",
      currency: settings.currency || "INR",
      merchant: extractedData.merchant || extractedData.description || "Voice Expense",
      description: extractedData.description || transcript,
      categoryId: matchedCategory.id,
      date: extractedData.date || new Date().toISOString().split("T")[0],
      time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      paymentMethod: (extractedData.paymentMethod as PaymentMethod) || "upi",
      source: "voice",
      status: "verified",
      confidence: extractedData.confidence || 0.95,
      notes: `Voice recorded: "${transcript}"`,
      tags: ["voice-entry"]
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setIsVoiceModalOpen(false);
    }, 900);
  };

  const sampleVoicePhrases = [
    "Today I spent 350 rupees on dinner",
    "Paid 120 rupees auto fare to college",
    "Spent 500 on groceries at Blinkit",
    "Paid 1200 electricity bill by UPI",
    "Bought 450 rupees medicines from pharmacy"
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900 dark:text-white">Voice Expense Entry</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Speak naturally in English, Hindi, or Hinglish</p>
            </div>
          </div>
          <button
            onClick={() => setIsVoiceModalOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-center">
          {savedSuccess ? (
            <div className="py-8 space-y-3 animate-fadeIn">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h4 className="font-bold text-lg text-gray-900 dark:text-white">Expense Saved!</h4>
              <p className="text-xs text-gray-500 font-medium">₹{extractedData?.amount} added to your timeline.</p>
            </div>
          ) : (
            <>
              {/* Mic Visualizer Button */}
              <div className="relative my-4 flex justify-center">
                {isListening && (
                  <div className="absolute inset-0 w-24 h-24 mx-auto rounded-full bg-indigo-500/20 animate-ping" />
                )}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer ${
                    isListening
                      ? "bg-rose-500 text-white shadow-rose-500/40 ring-4 ring-rose-300"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30"
                  }`}
                >
                  {isListening ? <MicOff className="w-8 h-8 animate-pulse" /> : <Mic className="w-8 h-8" />}
                </button>
              </div>

              <p className="text-xs font-bold text-gray-600 dark:text-slate-300">
                {isListening ? "Listening... Speak your expense now" : "Tap microphone to start speaking"}
              </p>

              {/* Transcript Display */}
              <div className="mt-4 p-4 bg-[#F2F4F7] dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 text-left min-h-[60px] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Live Transcript</span>
                  {transcript && !isProcessing && (
                    <button
                      onClick={() => handleProcessTranscript()}
                      className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                    >
                      Process with AI
                    </button>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800 dark:text-slate-200 italic">
                  {transcript || "“Today I spent 350 rupees on dinner...”"}
                </p>
              </div>

              {errorMessage && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 text-left font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Sample Voice Prompts */}
              <div className="mt-4 text-left">
                <span className="text-[11px] font-bold text-gray-400 block mb-2">
                  Or test with sample spoken phrases:
                </span>
                <div className="space-y-2">
                  {sampleVoicePhrases.map((phrase, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setTranscript(phrase);
                        handleProcessTranscript(phrase);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-gray-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-2xl transition-colors border border-gray-200/80 dark:border-slate-700/60 flex items-center justify-between shadow-xs cursor-pointer"
                    >
                      <span className="font-medium">“{phrase}”</span>
                      <Volume2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Extracted Structured Card */}
              {isProcessing && (
                <div className="mt-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 font-bold">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>AI is extracting amount, merchant & category...</span>
                </div>
              )}

              {extractedData && !isProcessing && (
                <div className="mt-4 p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-left space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Extracted Structured Expense
                    </span>
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-200/60 dark:bg-indigo-900/60 px-2.5 py-0.5 rounded-full">
                      {Math.round((extractedData.confidence || 0.95) * 100)}% Match
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs">
                      <span className="text-[10px] text-gray-400 block font-bold">Amount</span>
                      <span className="font-black text-base text-gray-900 dark:text-white">
                        ₹{extractedData.amount}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs">
                      <span className="text-[10px] text-gray-400 block font-bold">Category</span>
                      <span className="font-bold text-gray-800 dark:text-slate-200">{extractedData.category}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 col-span-2 shadow-xs">
                      <span className="text-[10px] text-gray-400 block font-bold">Description</span>
                      <span className="font-medium text-gray-800 dark:text-slate-200">{extractedData.description}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmSave}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-indigo-600/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Confirm & Add to Expenses</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
