// SVB Money Market / Sweep CSV parser.
// Columns: Date, Description, Credit, Debit, Balance
import {
  autoCategorize,
  norm,
  parseAmount,
  ParsedTxn,
  rid,
  splitCsvLine,
  toIsoDate,
} from "./types";

const HEADER_MAP: Record<string, "date" | "description" | "credit" | "debit" | "balance"> = {
  date: "date",
  postingdate: "date",
  description: "description",
  memo: "description",
  details: "description",
  credit: "credit",
  credits: "credit",
  deposit: "credit",
  debit: "debit",
  debits: "debit",
  withdrawal: "debit",
  balance: "balance",
  endingbalance: "balance",
  runningbalance: "balance",
};

export const parseSvbMoneyMarketCsv = (text: string): ParsedTxn[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  let headerIdx = -1;
  let mapping: Array<keyof typeof HEADER_MAP | string | null> = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = splitCsvLine(lines[i]);
    const m = cols.map((c) => HEADER_MAP[norm(c)] ?? null);
    if (
      m.includes("date") &&
      m.includes("description") &&
      m.includes("credit") &&
      m.includes("debit")
    ) {
      headerIdx = i;
      mapping = m;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const rows: ParsedTxn[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;
    const rec: Record<string, string> = {};
    cols.forEach((val, idx) => {
      const k = mapping[idx];
      if (k) rec[k] = val;
    });
    const date = toIsoDate(rec.date || "");
    const vendor = (rec.description || "").trim();
    const credit = parseAmount(rec.credit || "0");
    const debit = parseAmount(rec.debit || "0");
    const amount = credit - debit;
    if (!date || !vendor || amount === 0) continue;
    rows.push({
      id: rid(),
      date,
      vendor,
      amount,
      balance: rec.balance ? parseAmount(rec.balance) : null,
      category: autoCategorize(vendor, "svb_money_market"),
      bank_source: "svb_money_market",
    });
  }
  return rows;
};
