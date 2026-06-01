// SVB BAI export parser — used for both svb_checking and svb_collateral.
// Real columns (representative):
//   Bank ID, Account Number, Account Title, BAI Type Code,
//   Credit Amount, Debit Amount, Closing Ledger Balance,
//   Posting Date (or As Of Date / Transaction Date),
//   Text / Customer Reference / Bank Reference  (description-ish)
//
// Amount derivation:
//   amount = creditAmount - debitAmount (negative on outflows)
// Balance:
//   "Closing Ledger Balance" if present, otherwise null.
// Vendor (description):
//   first non-empty of Text, Customer Reference, Bank Reference, BAI Type Code,
//   else Account Title.
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

type Field =
  | "date"
  | "credit"
  | "debit"
  | "balance"
  | "text"
  | "custref"
  | "bankref"
  | "baitype"
  | "accounttitle"
  | "accountnumber";

const HEADER_MAP: Record<string, Field> = {
  // Date variants
  date: "date",
  postingdate: "date",
  postedat: "date",
  asofdate: "date",
  transactiondate: "date",
  valuedate: "date",
  effectivedate: "date",
  // Credit / Debit (BAI)
  creditamount: "credit",
  credit: "credit",
  credits: "credit",
  deposit: "credit",
  debitamount: "debit",
  debit: "debit",
  debits: "debit",
  withdrawal: "debit",
  // Balance
  closingledgerbalance: "balance",
  ledgerbalance: "balance",
  closingbalance: "balance",
  endingbalance: "balance",
  runningbalance: "balance",
  balance: "balance",
  // Description-ish
  text: "text",
  description: "text",
  memo: "text",
  details: "text",
  customerreference: "custref",
  custref: "custref",
  bankreference: "bankref",
  bankref: "bankref",
  baitypecode: "baitype",
  baicode: "baitype",
  baitype: "baitype",
  // Account identifiers
  accounttitle: "accounttitle",
  accountnumber: "accountnumber",
};

export const parseSvbCheckingCsv = (
  rawText: string,
  source: BankSource = "svb_checking",
): ParsedTxn[] => {
  const text = normalizeText(rawText);
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  let headerIdx = -1;
  let mapping: Array<Field | null> = [];
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const cols = splitCsvLine(lines[i]);
    const m = cols.map((c) => HEADER_MAP[norm(c)] ?? null);
    const hasDate = m.includes("date");
    const hasAmount = m.includes("credit") || m.includes("debit");
    if (hasDate && hasAmount) {
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
    const rec: Partial<Record<Field, string>> = {};
    cols.forEach((val, idx) => {
      const k = mapping[idx];
      if (k && val) rec[k] = val;
    });

    const date = toIsoDate(rec.date || "");
    if (!date) continue;

    const credit = parseAmount(rec.credit || "0");
    const debit = parseAmount(rec.debit || "0");
    const amount = Math.abs(credit) - Math.abs(debit);
    if (amount === 0) continue;

    const vendor =
      (rec.text || rec.custref || rec.bankref || rec.baitype || rec.accounttitle || "")
        .trim() || "(no description)";

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
