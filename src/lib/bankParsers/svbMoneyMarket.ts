// SVB Money-Market sweep report parser.
// Real columns: Date, Transaction, Sweep Account, Sweep Product, Amount
// (legacy Date/Description/Credit/Debit/Balance also supported as a fallback).
//
// Sweep reports do NOT carry a running balance. To produce trustworthy
// per-row balances we require an external anchor — the operator-set EOD
// balance as of a known date (see assumptions: mm_anchor_date +
// mm_anchor_balance). Without an anchor we leave every row's balance null
// so the opening balance falls back to manual entry instead of fabricating
// a wrong number from cumulative sums starting at zero.
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

// EOD balance as of `date` (YYYY-MM-DD). The anchor is treated as the
// closing balance for that day — same-day rows are considered already
// reflected in the anchor and emit `balance: null`.
export interface MmAnchor {
  date: string;
  balance: number;
}

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

type Intermediate = {
  origIdx: number;
  date: string;
  vendor: string;
  amount: number;
  rawBalance: number | null;
};

export const parseSvbMoneyMarketCsv = (
  rawText: string,
  anchor?: MmAnchor | null,
): ParsedTxn[] => {
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

  // ---- Pass 1: parse all rows (order-independent) ----
  const items: Intermediate[] = [];
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
    let rawBalance: number | null = null;

    if (mode === "sweep") {
      amount = parseAmount(rec.amount || "0");
      vendor =
        (rec.transaction || rec.sweepproduct || rec.sweepaccount || "").trim() ||
        "Sweep";
    } else {
      const credit = parseAmount(rec.credit || "0");
      const debit = parseAmount(rec.debit || "0");
      amount = Math.abs(credit) - Math.abs(debit);
      vendor = (rec.description || "").trim() || "Sweep";
      rawBalance = rec.balance ? parseAmount(rec.balance) : null;
    }

    if (amount === 0) continue;

    items.push({ origIdx: items.length, date, vendor, amount, rawBalance });
  }

  // ---- Pass 2: compute balances chronologically ----
  const balanceByOrig: Record<number, number | null> = {};
  if (items.some((it) => it.rawBalance != null)) {
    // Legacy real-balance column wins verbatim where present.
    for (const it of items) balanceByOrig[it.origIdx] = it.rawBalance;
  } else if (anchor) {
    const sorted = [...items].sort((a, b) =>
      a.date === b.date ? a.origIdx - b.origIdx : a.date < b.date ? -1 : 1,
    );
    let running = anchor.balance;
    for (const it of sorted) {
      if (it.date <= anchor.date) {
        balanceByOrig[it.origIdx] = null; // already reflected in the anchor
      } else {
        running += it.amount;
        balanceByOrig[it.origIdx] = running;
      }
    }
  } else {
    // No anchor → never fabricate a balance from zero.
    for (const it of items) balanceByOrig[it.origIdx] = null;
  }

  // ---- Emit ParsedTxn in original parse order ----
  return items.map((it) => ({
    id: rid(),
    date: it.date,
    vendor: it.vendor,
    amount: it.amount,
    balance: balanceByOrig[it.origIdx] ?? null,
    category: autoCategorize(it.vendor, "svb_money_market"),
    bank_source: "svb_money_market" as const,
  }));
};
