// Brex CSV parser. Handles Brex Primary, Treasury, and Stripe Clearing exports.
// Columns: Date, To/From (or Description), Amount, Balance, Status, Account Number Last Four
import {
  autoCategorize,
  BankSource,
  norm,
  normalizeText,
  parseAmount,
  ParsedTxn,
  rid,
  splitCsvLine,
  toIsoDate,
} from "./types";

const HEADER_MAP: Record<
  string,
  "date" | "vendor" | "amount" | "balance" | "status" | "last4"
> = {
  date: "date",
  postingdate: "date",
  initiateddate: "date",
  postedat: "date",
  transactiondate: "date",
  tofrom: "vendor",
  description: "vendor",
  merchant: "vendor",
  payee: "vendor",
  counterparty: "vendor",
  memo: "vendor",
  amount: "amount",
  amountusd: "amount",
  signedtransactionamount: "amount",
  balance: "balance",
  endingbalance: "balance",
  runningbalance: "balance",
  status: "status",
  accountnumberlastfour: "last4",
  accountlastfour: "last4",
  last4: "last4",
};

const SKIP_STATUSES = new Set(["pending", "scheduled", "canceled", "cancelled", "failed"]);

export const parseBrexCsv = (rawText: string, source: BankSource): ParsedTxn[] => {
  const text = normalizeText(rawText);
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  let headerIdx = -1;
  let mapping: Array<keyof typeof HEADER_MAP | string | null> = [];
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cols = splitCsvLine(lines[i]);
    const m = cols.map((c) => HEADER_MAP[norm(c)] ?? null);
    if (m.includes("date") && m.includes("amount") && m.includes("vendor")) {
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
    const vendor = (rec.vendor || "").trim();
    const amount = parseAmount(rec.amount || "0");
    if (!date || !vendor || amount === 0) continue;
    if (rec.status && SKIP_STATUSES.has(norm(rec.status))) continue;

    rows.push({
      id: rid(),
      date,
      vendor,
      amount,
      balance: rec.balance ? parseAmount(rec.balance) : null,
      category: autoCategorize(vendor, source),
      bank_source: source,
    });
  }
  return rows;
};
