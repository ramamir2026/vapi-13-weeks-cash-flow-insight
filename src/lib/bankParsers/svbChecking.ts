// SVB Analysis Checking CSV parser.
// Columns: Date, Description, Amount, Balance
import {
  autoCategorize,
  norm,
  parseAmount,
  ParsedTxn,
  rid,
  splitCsvLine,
  toIsoDate,
} from "./types";

const HEADER_MAP: Record<string, "date" | "description" | "amount" | "balance"> = {
  date: "date",
  postingdate: "date",
  transactiondate: "date",
  description: "description",
  memo: "description",
  details: "description",
  amount: "amount",
  transactionamount: "amount",
  balance: "balance",
  runningbalance: "balance",
  endingbalance: "balance",
};

export const parseSvbCheckingCsv = (text: string): ParsedTxn[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  let headerIdx = -1;
  let mapping: Array<keyof typeof HEADER_MAP | string | null> = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = splitCsvLine(lines[i]);
    const m = cols.map((c) => HEADER_MAP[norm(c)] ?? null);
    if (m.includes("date") && m.includes("description") && m.includes("amount")) {
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
    const amount = parseAmount(rec.amount || "0");
    if (!date || !vendor || amount === 0) continue;
    rows.push({
      id: rid(),
      date,
      vendor,
      amount,
      balance: rec.balance ? parseAmount(rec.balance) : null,
      category: autoCategorize(vendor, "svb_checking"),
      bank_source: "svb_checking",
    });
  }
  return rows;
};
