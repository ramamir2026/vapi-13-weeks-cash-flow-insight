// Parser for the Ramp "Business Accounts — Transfers" CSV export.
//
// Columns (header-mapped, tolerant): Type, From, To, Amount, Date, Status, Remark.
// Amount is already signed (negative = outflow). The export carries no running
// balance, so ParsedTxn.balance is always null. Counterparty resolution: the
// endpoint that is NOT one of our own Ramp accounts ("Checking Account" /
// "Investment Account"). Both-ends-own transfers, and rows flagged by
// isInternalTransfer, are categorized as "zba_sweep".
import {
  BankSource,
  ParsedTxn,
  autoCategorize,
  isInternalTransfer,
  norm,
  normalizeText,
  parseAmount,
  rid,
  splitCsvLine,
  toIsoDate,
} from "./types";

const OWN_ACCOUNTS = ["checking account", "investment account"];

const SKIP_STATUSES = new Set([
  "pending",
  "processing",
  "scheduled",
  "canceled",
  "cancelled",
  "failed",
  "reversed",
  "returned",
  "declined",
  "void",
  "voided",
]);

export const isRampTransfersHeader = (cols: string[]): boolean => {
  const set = new Set(cols.map(norm));
  return set.has("from") && set.has("to") && set.has("amount") && set.has("date");
};

const findIndex = (cols: string[], tokens: string[]): number => {
  for (let i = 0; i < cols.length; i++) {
    if (tokens.includes(cols[i])) return i;
  }
  return -1;
};

const isOwn = (s: string): boolean => {
  const v = s.toLowerCase();
  return OWN_ACCOUNTS.some((o) => v.includes(o));
};

export const parseRampTransfersCsv = (
  rawText: string,
  source: BankSource = "ramp_checking",
): ParsedTxn[] => {
  const text = normalizeText(rawText);
  const lines = text.split("\n");
  const limit = Math.min(lines.length, 40);
  let headerIdx = -1;
  let headerCols: string[] = [];
  for (let i = 0; i < limit; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cols = splitCsvLine(raw).map(norm);
    if (isRampTransfersHeader(cols)) {
      headerIdx = i;
      headerCols = cols;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const idxType = findIndex(headerCols, ["type"]);
  const idxFrom = findIndex(headerCols, ["from"]);
  const idxTo = findIndex(headerCols, ["to"]);
  const idxAmount = findIndex(headerCols, ["amount"]);
  const idxDate = findIndex(headerCols, ["date"]);
  const idxStatus = findIndex(headerCols, ["status"]);
  const idxRemark = findIndex(headerCols, ["remark", "memo", "note"]);

  const out: ParsedTxn[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cols = splitCsvLine(raw);
    if (cols.every((c) => !c)) continue;

    const dateRaw = idxDate >= 0 ? cols[idxDate] ?? "" : "";
    const date = toIsoDate(dateRaw);
    if (!date) continue;

    const amount = idxAmount >= 0 ? parseAmount(cols[idxAmount] ?? "") : 0;
    if (!amount) continue;

    const statusRaw = idxStatus >= 0 ? cols[idxStatus] ?? "" : "";
    const statusNorm = statusRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (statusNorm && SKIP_STATUSES.has(statusNorm)) continue;

    const from = (idxFrom >= 0 ? cols[idxFrom] ?? "" : "").trim();
    const to = (idxTo >= 0 ? cols[idxTo] ?? "" : "").trim();
    const remark = (idxRemark >= 0 ? cols[idxRemark] ?? "" : "").trim();
    void idxType;

    const fromOwn = isOwn(from);
    const toOwn = isOwn(to);
    const counterpartyRaw = fromOwn ? to : toOwn ? from : to || from;
    const vendor = counterpartyRaw.replace(/^\s*bill pay:\s*/i, "").trim();

    const internal = (fromOwn && toOwn) || isInternalTransfer(counterpartyRaw, remark);
    const category = internal ? "zba_sweep" : autoCategorize(vendor, source, remark);

    out.push({
      id: rid(),
      date,
      vendor,
      amount,
      balance: null,
      category,
      bank_source: source,
    });
  }
  return out;
};
