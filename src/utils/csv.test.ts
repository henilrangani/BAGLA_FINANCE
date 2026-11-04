import { describe, expect, it } from "vitest";
import { normalizeStatementDate, parseStatementCsv, splitCsvLine } from "./csv";

describe("splitCsvLine", () => {
  it("handles quotes and escaped quotes", () => {
    expect(splitCsvLine('2026-11-01,"Swiggy, Bangalore","1,250.00",Food,upi')).toEqual([
      "2026-11-01", "Swiggy, Bangalore", "1,250.00", "Food", "upi",
    ]);
    expect(splitCsvLine('a,"say ""hi""",c')).toEqual(["a", 'say "hi"', "c"]);
  });
});

describe("normalizeStatementDate", () => {
  it("accepts ISO and Indian formats", () => {
    expect(normalizeStatementDate("2026-11-04")).toBe("2026-11-04");
    expect(normalizeStatementDate("04/11/2026")).toBe("2026-11-04");
    expect(normalizeStatementDate("4-1-2026")).toBe("2026-01-04");
    expect(normalizeStatementDate("31/02/2026")).toBeNull();
    expect(normalizeStatementDate("")).toBeNull();
  });
});

describe("parseStatementCsv", () => {
  it("parses the legacy format as expenses and skips a header", () => {
    const r = parseStatementCsv("Date,Merchant,Amount,Category,Method\n2026-08-18, Starbucks Coffee, 350, Food & Dining, upi\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ date: "2026-08-18", merchant: "Starbucks Coffee", amount: 350, type: "expense", paymentMethod: "upi" });
  });

  it("keeps thousands separators intact inside quotes", () => {
    const r = parseStatementCsv('01/11/2026,"Rent, Nov","1,25,000.50",Rent,bank transfer');
    expect(r.rows[0].amount).toBe(125000.5);
    expect(r.rows[0].paymentMethod).toBe("bank_transfer");
  });

  it("uses an explicit type column, including credits and refunds", () => {
    const r = parseStatementCsv(
      "2026-11-01,Salary,50000,Income,bank_transfer,credit\n2026-11-02,Amazon,-499,Shopping,upi,refund\n2026-11-03,To savings,10000,,bank_transfer,transfer"
    );
    expect(r.errors).toEqual([]);
    expect(r.rows.map(x => [x.type, x.amount])).toEqual([["income", 50000], ["refund", 499], ["transfer", 10000]]);
  });

  it("refuses to guess negative amounts without a type", () => {
    const r = parseStatementCsv("2026-11-01,Something,-500,Other,upi");
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].message).toMatch(/Negative amount/);
  });

  it("reports bad rows instead of defaulting them", () => {
    const r = parseStatementCsv("not-a-date,X,10\n2026-11-01,Y,abc\n2026-11-01,Z,10.555\n2026-11-01,W\n2026-11-01,V,10,,,weird");
    expect(r.rows).toHaveLength(0);
    expect(r.errors.map(e => e.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles CRLF and BOM", () => {
    const r = parseStatementCsv("﻿2026-11-01,A,10\r\n2026-11-02,B,20\r\n");
    expect(r.rows.map(x => x.amount)).toEqual([10, 20]);
  });
});
