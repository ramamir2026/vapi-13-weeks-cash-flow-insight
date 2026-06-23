// Reconciliation check for parsed bank rows.
// Read-only: walks already-parsed transactions and compares the implied
// movement (sum of amounts) against the recorded movement (last balance −
// first balance) within a RECENT window. Does not modify parser math.
//
// Why a window: bank exports often span multiple years. A full-history tie
// chronically warns on tiny historical drift and trains operators to ignore
// it. Reconciling within ~90 days of the file's latest row still catches any
// real mass row-drop (the drop will show up in the recent window too) while
// staying quiet about ancient data.
import type { BankSource, ParsedTxn } from "./types";
import { MANUAL_BALANCE_SOURCES } from "./types";

export type ReconciliationStatus = "ok" | "mismatch" | "no_balance" | "partial";

export interface ReconciliationResult {
  status: ReconciliationStatus;
  rowsWithBalance: number;        // total balance-bearing rows in the file
  windowRowCount: number;         // balance-bearing rows actually reconciled
  windowStartDate: string | null;
  firstBalance: number | null;
  lastBalance: number | null;
  firstDate: string | null;
  lastDate: string | null;
  expectedDelta: number | null;   // lastBalance − firstBalance
  computedDelta: number | null;   // Σ amount of window rows after the first
  diff: number | null;            // expectedDelta − computedDelta
  tolerance: number;
  message: string;
}

const RECENT_WINDOW_DAYS = 90;
const FALLBACK_MIN_ROWS = 50;
const DAY_MS = 86_400_000;

const empty = (
  status: ReconciliationStatus,
  rowsWithBalance: number,
  message: string,
): ReconciliationResult => ({
  status,
  rowsWithBalance,
  windowRowCount: 0,
  windowStartDate: null,
  firstBalance: null,
  lastBalance: null,
  firstDate: null,
  lastDate: null,
  expectedDelta: null,
  computedDelta: null,
  diff: null,
  tolerance: 0,
  message,
});

export const reconcileParsedRows = (
  rows: ParsedTxn[],
  source: BankSource,
): ReconciliationResult => {
  if (!rows.length) {
    return empty("no_balance", 0, "No parsed rows to reconcile.");
  }

  // Preserve original index so we keep parser-provided intraday order on ties.
  const indexed = rows.map((r, i) => ({ r, i }));
  const withBalance = indexed.filter(({ r }) => r.balance != null);

  if (withBalance.length === 0) {
    if (MANUAL_BALANCE_SOURCES.has(source)) {
      return empty(
        "no_balance",
        0,
        "This source doesn't carry a running balance — opening balance entered manually elsewhere.",
      );
    }
    return empty(
      "no_balance",
      0,
      "No rows carry a running balance, so reconciliation can't be computed.",
    );
  }

  // Sort chronologically; tiebreak on original index so same-day order matches
  // the parser's intraday ordering.
  withBalance.sort((a, b) => (a.r.date === b.r.date ? a.i - b.i : a.r.date < b.r.date ? -1 : 1));

  // Recent window: rows within RECENT_WINDOW_DAYS of the latest balance-bearing
  // row's date. Fallback: if that produces fewer than FALLBACK_MIN_ROWS, take
  // the last FALLBACK_MIN_ROWS balance-bearing rows instead.
  const latest = withBalance[withBalance.length - 1];
  const cutoffMs = new Date(`${latest.r.date}T00:00:00Z`).getTime() - RECENT_WINDOW_DAYS * DAY_MS;
  const cutoffIso = new Date(cutoffMs).toISOString().slice(0, 10);
  let windowRows = withBalance.filter(({ r }) => r.date >= cutoffIso);
  if (windowRows.length < FALLBACK_MIN_ROWS && withBalance.length > windowRows.length) {
    windowRows = withBalance.slice(-Math.min(FALLBACK_MIN_ROWS, withBalance.length));
  }

  if (windowRows.length < 2) {
    return empty(
      "partial",
      withBalance.length,
      "Not enough recent balance-bearing rows to reconcile.",
    );
  }

  const first = windowRows[0].r;
  const last = windowRows[windowRows.length - 1].r;
  const expectedDelta = (last.balance as number) - (first.balance as number);
  const computedDelta = windowRows
    .slice(1)
    .reduce((s, { r }) => s + Number(r.amount), 0);
  const diff = expectedDelta - computedDelta;
  const tolerance = Math.max(1.0, Math.abs(last.balance as number) * 0.001);

  // Partial: some balance coverage in the file is missing within the window.
  // We still report ok/mismatch based on what we have; the only difference is
  // a softer status if it ties.
  const hasGaps = withBalance.length < rows.length;

  if (Math.abs(diff) <= tolerance) {
    return {
      status: hasGaps ? "partial" : "ok",
      rowsWithBalance: withBalance.length,
      windowRowCount: windowRows.length,
      windowStartDate: windowRows[0].r.date,
      firstBalance: first.balance as number,
      lastBalance: last.balance as number,
      firstDate: first.date,
      lastDate: last.date,
      expectedDelta,
      computedDelta,
      diff,
      tolerance,
      message:
        hasGaps
          ? "Some rows are missing balance values; reconciliation ties within the recent window."
          : "Parsed transactions reconcile to the statement balance.",
    };
  }

  return {
    status: "mismatch",
    rowsWithBalance: withBalance.length,
    windowRowCount: windowRows.length,
    windowStartDate: windowRows[0].r.date,
    firstBalance: first.balance as number,
    lastBalance: last.balance as number,
    firstDate: first.date,
    lastDate: last.date,
    expectedDelta,
    computedDelta,
    diff,
    tolerance,
    message:
      `Parsed transactions don't reconcile to the statement balance. ` +
      `Recorded movement ${expectedDelta.toFixed(2)}, ` +
      `summed transactions ${computedDelta.toFixed(2)}, ` +
      `diff ${diff.toFixed(2)} (tolerance ${tolerance.toFixed(2)}).`,
  };
};
