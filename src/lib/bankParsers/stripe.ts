// Stripe CSV parser.
// Columns: Date, Description, Amount, Balance (Stripe export format)
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
  created: "date",
  createdutc: "date",
  availableondate: "date",
  description: "description",
  type: "description",
  reportingcategory: "description",
  amount: "amount",
  net: "amount",
  gross: "amount",
  balance: "balance",
  endingbalance: "balance",
};

export const parseStripeCsv = (text: string): ParsedTxn[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  let headerIdx = -1;
  let mapping: Array<keyof typeof HEADER_MAP | string | null> = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = splitCsvLine(lines[i]);
    const m = cols.map((c) => HEADER_MAP[norm(c)] ?? null);
    if (m.includes("date") && m.includes("amount")) {
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
    const vendor = (rec.description || "Stripe transaction").trim();
    const amount = parseAmount(rec.amount || "0");
    if (!date || amount === 0) continue;
    rows.push({
      id: rid(),
      date,
      vendor,
      amount,
      balance: rec.balance ? parseAmount(rec.balance) : null,
      category: autoCategorize(vendor, "stripe"),
      bank_source: "stripe",
    });
  }
  return rows;
};
