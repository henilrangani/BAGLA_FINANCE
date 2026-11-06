/**
 * Statement CSV parsing.
 *
 * Expected columns: Date, Merchant, Amount, Category, PaymentMethod[, Type]
 * - Quoted fields ("Swiggy, Bangalore") and Indian amounts ("1,25,000.00") work.
 * - Type may be: expense/debit/dr, income/credit/cr, refund, transfer.
 * - Without a Type column a positive amount is an expense (legacy format);
 *   a negative amount is ambiguous across banks and is reported as an error
 *   instead of being guessed.
 * - Invalid rows are returned as errors; nothing is silently defaulted.
 */
import type { PaymentMethod, TransactionType } from "../types";
import { parseRupeeInput } from "./money";
import { isValidIsoDate } from "./dates";

export interface CsvTransactionRow {
  line: number;
  date: string;
  merchant: string;
  amount: number; // rupees, exact paise, always positive
  categoryName: string;
  paymentMethod: PaymentMethod;
  type: TransactionType;
}

export interface CsvParseResult {
  rows: CsvTransactionRow[];
  errors: { line: number; message: string }[];
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash", "upi", "debit_card", "credit_card", "bank_transfer", "wallet", "cheque", "other",
];

const TYPE_ALIASES: Record<string, TransactionType> = {
  expense: "expense", debit: "expense", dr: "expense", withdrawal: "expense",
  income: "income", credit: "income", cr: "income", deposit: "income",
  refund: "refund", reversal: "refund",
  transfer: "transfer",
};

export const MAX_CSV_ROWS = 5000;

/** Split one CSV line into fields, honouring double quotes and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Accept YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY (Indian bank exports). */
export function normalizeStatementDate(raw: string): string | null {
  const s = raw.trim();
  if (isValidIsoDate(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
}

function looksLikeHeader(fields: string[]): boolean {
  const joined = fields.join(" ").toLowerCase();
  return /\bdate\b/.test(joined) && /\bamount\b/.test(joined);
}

export function parseStatementCsv(text: string): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [] };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  let dataRows = 0;
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    if (!rawLine.trim()) return;
    const fields = splitCsvLine(rawLine);
    if (lineNo === 1 && looksLikeHeader(fields)) return;

    if (++dataRows > MAX_CSV_ROWS) {
      if (dataRows === MAX_CSV_ROWS + 1) {
        result.errors.push({ line: lineNo, message: `Only the first ${MAX_CSV_ROWS} rows are imported` });
      }
      return;
    }

    if (fields.length < 3) {
      result.errors.push({ line: lineNo, message: "Expected at least Date, Merchant, Amount" });
      return;
    }
    const [rawDate, merchant, rawAmount, categoryName = "", rawMethod = "", rawType = ""] = fields;

    const date = normalizeStatementDate(rawDate);
    if (!date) {
      result.errors.push({ line: lineNo, message: `Invalid date "${rawDate}"` });
      return;
    }

    const parsed = parseRupeeInput(rawAmount, { allowNegative: true });
    if (parsed.ok === false) {
      result.errors.push({ line: lineNo, message: `${parsed.error} ("${rawAmount}")` });
      return;
    }

    let type: TransactionType | undefined;
    if (rawType) {
      type = TYPE_ALIASES[rawType.toLowerCase()];
      if (!type) {
        result.errors.push({ line: lineNo, message: `Unknown type "${rawType}"` });
        return;
      }
    } else if (parsed.paise < 0) {
      result.errors.push({
        line: lineNo,
        message: "Negative amount without a Type column — add expense/income/refund/transfer",
      });
      return;
    } else {
      type = "expense";
    }

    const method = rawMethod.toLowerCase().replace(/\s+/g, "_") as PaymentMethod;
    result.rows.push({
      line: lineNo,
      date,
      merchant: merchant || "Statement Item",
      amount: Math.abs(parsed.rupees),
      categoryName,
      paymentMethod: PAYMENT_METHODS.includes(method) ? method : "bank_transfer",
      type,
    });
  });

  return result;
}

/**
 * One CSV cell for export: always quoted, embedded quotes doubled, and text that a spreadsheet
 * would run as a formula (=, +, -, @, tab, CR at the start) prefixed with ' (OWASP CSV injection).
 * Numbers are written as plain numbers so they stay numeric.
 */
export function csvCell(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
