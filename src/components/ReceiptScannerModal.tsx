import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  FileText,
  Upload,
  Camera,
  X,
  Sparkles,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  Users,
  Image as ImageIcon
} from "lucide-react";
import { ReceiptData, ReceiptItem } from "../types";
import { localDateString } from "../utils/dates";
import { addRupees, safeRupees, splitRupeesEqually, sumRupees } from "../utils/money";

export const ReceiptScannerModal: React.FC = () => {
  const {
    isReceiptModalOpen,
    setIsReceiptModalOpen,
    categories,
    groups,
    addTransaction,
    addGroupExpense,
    scanReceiptImage,
    settings
  } = useFinance();

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [extractedReceipt, setExtractedReceipt] = useState<ReceiptData | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isReceiptModalOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPreviewImage(base64);
      processReceipt(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const processReceipt = async (base64Data: string, mimeType = "image/jpeg") => {
    setIsScanning(true);
    try {
      const result = await scanReceiptImage(base64Data, mimeType);
      setExtractedReceipt(result);
    } catch (err) {
      console.error("Scan error:", err);
    } finally {
      setIsScanning(false);
    }
  };

  // Sample quick test receipts
  const loadSampleReceipt = (type: "restaurant" | "grocery" | "fuel") => {
    let mock: ReceiptData;
    if (type === "restaurant") {
      mock = {
        merchant: "Haldiram's Sweets & Restaurant",
        date: localDateString(),
        totalAmount: 682.50,
        subtotal: 650.00,
        taxAmount: 32.50,
        confidence: 0.96,
        items: [
          { name: "Special Rajasthani Thali", quantity: 1, price: 350.00 },
          { name: "Paneer Tikka Roll", quantity: 1, price: 180.00 },
          { name: "Gulab Jamun (2 pcs)", quantity: 1, price: 120.00 }
        ]
      };
    } else if (type === "grocery") {
      mock = {
        merchant: "Blinkit Quick Commerce",
        date: localDateString(),
        totalAmount: 940.00,
        subtotal: 910.00,
        taxAmount: 30.00,
        confidence: 0.98,
        items: [
          { name: "Aashirvaad Shudh Chakki Atta 5kg", quantity: 1, price: 245.00 },
          { name: "Amul Taaza Milk 1L (x2)", quantity: 2, price: 136.00 },
          { name: "Farm Fresh Farm Eggs (Pack of 12)", quantity: 1, price: 120.00 },
          { name: "Fresh Organic Vegetables & Herbs", quantity: 1, price: 439.00 }
        ]
      };
    } else {
      mock = {
        merchant: "Indian Oil Petrol Pump",
        date: localDateString(),
        totalAmount: 1200.00,
        subtotal: 1016.95,
        taxAmount: 183.05,
        confidence: 0.99,
        items: [
          { name: "Petrol (Motor Spirit) 11.8 Litres", quantity: 1, price: 1200.00 }
        ]
      };
    }

    setPreviewImage(null);
    setExtractedReceipt(mock);
  };

  const handleUpdateItem = (index: number, field: keyof ReceiptItem, val: any) => {
    if (!extractedReceipt) return;
    const newItems = [...extractedReceipt.items];
    newItems[index] = { ...newItems[index], [field]: val };
    const newSubtotal = sumRupees(newItems.map(i => i.price));
    const newTotal = addRupees(newSubtotal, extractedReceipt.taxAmount || 0);

    setExtractedReceipt({
      ...extractedReceipt,
      items: newItems,
      subtotal: newSubtotal,
      totalAmount: newTotal
    });
  };

  const handleDeleteItem = (index: number) => {
    if (!extractedReceipt) return;
    const newItems = extractedReceipt.items.filter((_, idx) => idx !== index);
    const newSubtotal = sumRupees(newItems.map(i => i.price));
    const newTotal = addRupees(newSubtotal, extractedReceipt.taxAmount || 0);

    setExtractedReceipt({
      ...extractedReceipt,
      items: newItems,
      subtotal: newSubtotal,
      totalAmount: newTotal
    });
  };

  const handleAddItem = () => {
    if (!extractedReceipt) return;
    const newItems = [...extractedReceipt.items, { name: "New Item", quantity: 1, price: 100 }];
    const newSubtotal = sumRupees(newItems.map(i => i.price));
    setExtractedReceipt({
      ...extractedReceipt,
      items: newItems,
      subtotal: newSubtotal,
      totalAmount: addRupees(newSubtotal, extractedReceipt.taxAmount || 0)
    });
  };

  const handleConfirmSaveReceipt = () => {
    if (!extractedReceipt) return;
    // Never save an empty / failed scan as a transaction.
    if (!(safeRupees(extractedReceipt.totalAmount) > 0)) return;

    const matchedCategory = categories.find(
      c => c.name.toLowerCase().includes("food") || c.name.toLowerCase().includes("grocery")
    ) || categories[0];

    // Check if saving to group
    if (selectedGroupId) {
      const group = groups.find(g => g.id === selectedGroupId);
      if (group) {
        // Exact split; shares always add up to the receipt total.
        const shares = splitRupeesEqually(extractedReceipt.totalAmount, Math.max(group.members.length, 1));
        const currentMember = group.members.find(m => m.isCurrentUser) || group.members[0];

        addGroupExpense(selectedGroupId, {
          description: `${extractedReceipt.merchant} Bill`,
          amount: extractedReceipt.totalAmount,
          currency: group.currency || "INR",
          categoryId: matchedCategory.id,
          paidByMemberId: currentMember.id,
          splitType: "equal",
          participants: group.members.map((m, i) => ({
            memberId: m.id,
            amountOwed: shares[i]
          })),
          date: extractedReceipt.date,
          time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          receiptData: extractedReceipt
        });
      }
    } else {
      // Personal transaction
      addTransaction({
        amount: extractedReceipt.totalAmount,
        type: "expense",
        currency: settings.currency || "INR",
        merchant: extractedReceipt.merchant,
        description: `Receipt: ${extractedReceipt.merchant}`,
        categoryId: matchedCategory.id,
        date: extractedReceipt.date,
        time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        paymentMethod: "upi",
        source: "receipt",
        receiptData: extractedReceipt,
        status: (extractedReceipt.confidence || 0) >= 0.8 ? "verified" : "pending_review",
        confidence: extractedReceipt.confidence || 0,
        // Low-confidence AI reads must be reviewed by the user.
        notes: `Extracted ${extractedReceipt.items?.length || 0} line items. GST: ₹${extractedReceipt.taxAmount || 0}`,
        tags: ["receipt-scan"]
      });
    }

    setSaveSuccess(true);
    setTimeout(() => {
      setIsReceiptModalOpen(false);
      setExtractedReceipt(null);
      setPreviewImage(null);
      setSaveSuccess(false);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900 dark:text-white">AI Receipt & Bill Scanner</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Extracts merchant, items, GST, and totals</p>
            </div>
          </div>
          <button
            onClick={() => setIsReceiptModalOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {saveSuccess ? (
            <div className="py-12 text-center space-y-3 animate-fadeIn">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h4 className="font-bold text-lg text-gray-900 dark:text-white">Receipt Recorded Successfully!</h4>
              <p className="text-xs text-gray-500 font-medium">₹{extractedReceipt?.totalAmount} saved with itemized archive.</p>
            </div>
          ) : (
            <>
              {/* Upload Zone */}
              {!extractedReceipt && !isScanning && (
                <div className="space-y-4">
                  <label className="border-2 border-dashed border-gray-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#F2F4F7] dark:bg-slate-800/30">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-xs">
                      <Upload className="w-7 h-7" />
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-slate-200 mb-1">
                      Upload receipt image or bill
                    </span>
                    <span className="text-xs text-gray-500 text-center max-w-xs font-medium">
                      Drag and drop PNG, JPG, or PDF statement, or click to browse
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {/* Sample Test Receipts */}
                  <div>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                      Or load demo sample receipts:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => loadSampleReceipt("restaurant")}
                        className="p-3.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-500 text-left transition-all shadow-xs cursor-pointer"
                      >
                        <span className="font-bold text-xs text-gray-900 dark:text-white block">
                          🍛 Restaurant Bill
                        </span>
                        <span className="text-[11px] text-gray-500 font-medium">Haldiram • ₹682.50</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => loadSampleReceipt("grocery")}
                        className="p-3.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-500 text-left transition-all shadow-xs cursor-pointer"
                      >
                        <span className="font-bold text-xs text-gray-900 dark:text-white block">
                          🛒 Grocery Receipt
                        </span>
                        <span className="text-[11px] text-gray-500 font-medium">Blinkit • ₹940.00</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => loadSampleReceipt("fuel")}
                        className="p-3.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-500 text-left transition-all shadow-xs cursor-pointer"
                      >
                        <span className="font-bold text-xs text-gray-900 dark:text-white block">
                          ⛽ Fuel Petrol Pump
                        </span>
                        <span className="text-[11px] text-gray-500 font-medium">Indian Oil • ₹1,200</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Scanning Loader */}
              {isScanning && (
                <div className="py-12 text-center space-y-3">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <h4 className="font-bold text-sm text-gray-900 dark:text-slate-200">
                    Scanning Receipt with Gemini Multimodal AI...
                  </h4>
                  <p className="text-xs text-gray-500 font-medium">
                    Extracting merchant, items, GST, and totals
                  </p>
                </div>
              )}

              {/* Extracted Structured Receipt View & Editor */}
              {extractedReceipt && (
                <div className="space-y-4 animate-fadeIn">
                  {/* Top Bar Summary */}
                  <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/80 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-300 block">
                        Merchant / Store
                      </span>
                      <input
                        type="text"
                        value={extractedReceipt.merchant}
                        onChange={e => setExtractedReceipt({ ...extractedReceipt, merchant: e.target.value })}
                        className="font-black text-base text-gray-900 dark:text-white bg-transparent border-b border-indigo-300 dark:border-indigo-700 focus:outline-none"
                      />
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-300 block">
                        Total Amount (INR)
                      </span>
                      <span className="font-black text-xl text-gray-900 dark:text-white">
                        ₹{extractedReceipt.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Date & Tax */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-gray-500 dark:text-slate-400 font-bold block mb-1">Receipt Date</label>
                      <input
                        type="date"
                        value={extractedReceipt.date}
                        onChange={e => setExtractedReceipt({ ...extractedReceipt, date: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white font-semibold outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 dark:text-slate-400 font-bold block mb-1">GST / Tax Amount (₹)</label>
                      <input
                        type="number"
                        value={extractedReceipt.taxAmount || 0}
                        onChange={e => setExtractedReceipt({ ...extractedReceipt, taxAmount: safeRupees(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white font-semibold outline-none"
                      />
                    </div>
                  </div>

                  {/* Itemized Table */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                        Itemized Items ({extractedReceipt.items?.length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Item</span>
                      </button>
                    </div>

                    <div className="border border-gray-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-gray-200 dark:divide-slate-700 text-xs shadow-xs">
                      {extractedReceipt.items?.map((item, idx) => (
                        <div key={idx} className="p-3 flex items-center gap-2 bg-white dark:bg-slate-800/60">
                          <input
                            type="text"
                            value={item.name}
                            onChange={e => handleUpdateItem(idx, "name", e.target.value)}
                            className="flex-1 px-2 py-1 rounded-lg bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-500 outline-none text-gray-900 dark:text-slate-200 font-medium"
                          />
                          <div className="flex items-center gap-1 w-24">
                            <span className="text-gray-400 text-[10px] font-bold">Qty:</span>
                            <input
                              type="number"
                              value={item.quantity || 1}
                              onChange={e => handleUpdateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                              className="w-12 px-1.5 py-0.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-900 text-center font-bold"
                            />
                          </div>
                          <div className="flex items-center gap-1 w-28">
                            <span className="text-gray-400 text-xs font-bold">₹</span>
                            <input
                              type="number"
                              step="any"
                              value={item.price}
                              onChange={e => handleUpdateItem(idx, "price", safeRupees(e.target.value))}
                              className="w-20 px-1.5 py-0.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-900 text-right font-bold"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(idx)}
                            className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg hover:bg-gray-100 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Split across Trip / Group option */}
                  {groups.length > 0 && (
                    <div className="p-4 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
                      <label className="text-xs font-bold text-gray-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Split this bill with a Group / Trip? (Optional)</span>
                      </label>
                      <select
                        value={selectedGroupId}
                        onChange={e => setSelectedGroupId(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-gray-900 dark:text-slate-200 font-medium outline-none cursor-pointer"
                      >
                        <option value="">Personal expense (No group split)</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.coverEmoji} {g.name} ({g.members.length} members)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExtractedReceipt(null);
                        setPreviewImage(null);
                      }}
                      className="px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-xs font-bold hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Scan Another
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSaveReceipt}
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-indigo-600/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>
                        Save Receipt (₹{extractedReceipt.totalAmount.toLocaleString("en-IN")})
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
