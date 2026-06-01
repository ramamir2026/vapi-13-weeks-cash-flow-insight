// SVB Money-Market sweep report parser.
// Real columns: Date, Transaction, Sweep Account, Sweep Product, Amount
// (legacy Date/Description/Credit/Debit/Balance also supported as a fallback).
//
// Sweep reports do not include a running balance column. We derive a
// pseudo-balance per row as the cumulative sum of the Amount column, so the
// last row's balance equals the sweep account's ending position.
import {
  autoCategorize,
  norm,
  normalizeText,
  parseAmount,
  ParsedTxn,
  rid,
  splitCsvLine,
  toIsoDate,
} from "./types";

type Field =
  | "date"
  | "transaction"
  | "sweepaccount"
  | "sweepproduct"
  | "amount"
  | "credit"
  | "debit"
  | "balance"
  | "description";

const HEADER_MAP: Record<string, Field> = {
  date: "date",
  postingdate: "date",
  transactiondate: "date",
  valuedate: "date",
  transaction: "transaction",
  transactiontype: "transaction",
  sweepaccount: "sweepaccount",
  sweepproduct: "sweepproduct",
  amount: "amount",
  transactionamount: "amount",
  // Legacy fallback columns
  credit: "credit",
  credits: "credit",
  deposit: "credit",
  debit: "debit",
  debits: "debit",
  withdrawal: "debit",
  balance: "balance",
  endingbalance: "balance",
  runningbalance: "balance",
  description: "description",
  memo: "description",
  details: "description",
};

export const parseSvbMoneyMarketCsv = (rawText: string): ParsedTxn[] => {
  const text = normalizeText(rawText);
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  let headerIdx = -1;
  let mapping: Array<Field | null> = [];
  let mode: "sweep" | "credit_debit" | null = null;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const cols = splitCsvLine(lines[i]);
    const m = cols.map((c) => HEADER_MAP[norm(c)] ?? null);
    if (m.includes("date") && m.includes("amount") && m.includes("sweepproduct")) {
      headerIdx = i;
      mapping = m;
      mode = "sweep";
      break;
    }
    if (
      m.includes("date") &&
      m.includes("description") &&
      m.includes("credit") &&
      m.includes("debit")
    ) {
      headerIdx = i;
      mapping = m;
      mode = "credit_debit";
      break;
    }
  }
  if (headerIdx === -1 || !mode) return [];

  const rows: ParsedTxn[] = [];
  let running = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;
    const rec: Partial<Record<Field, string>> = {};
    cols.forEach((val, idx) => {
      const k = mapping[idx];
      if (k && val) rec[k] = val;
    });

    const date = toIsoDate(rec.date || "");
    if (!date) continue;

    let amount = 0;
    let vendor = "";
    let balance: number | null = null;

    if (mode === "sweep") {
      amount = parseAmount(rec.amount || "0");
      vendor =
        (rec.transaction || rec.sweepproduct || rec.sweepaccount || "").trim() ||
        "Sweep";
      running += amount;
      balance = running;
    } else {
      const credit = parseAmount(rec.credit || "0");
      const debit = parseAmount(rec.debit || "0");
      amount = Math.abs(credit) - Math.abs(debit);
      vendor = (rec.description || "").trim() || "Sweep";
      balance = rec.balance ? parseAmount(rec.balance) : null;
    }

    if (amount === 0) continue;

    rows.push({
      id: rid(),
      date,
      vendor,
      amount,
      balance,
      category: autoCategorize(vendor, "svb_money_market"),
      bank_source: "svb_money_market",
    });
  }
  return rows;
};
