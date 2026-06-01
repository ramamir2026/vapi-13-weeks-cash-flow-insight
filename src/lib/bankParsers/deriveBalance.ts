// Derive an account's opening balance from a parsed transactions file.
//
// Rule: do NOT use the last row. Take the running balance (or Closing Ledger
// Balance) from the row with the latest transaction date that is ≤ the
// report's cutoff date (the prior Friday). If multiple same-day rows exist,
// use the LAST row on that date (assumed to be the latest intraday posting).
import type { ParsedTxn } from "./types";

// Most recent Friday on or before `today` (UTC, YYYY-MM-DD).
// If today is Friday, returns today.
export const priorFridayISO = (today: Date = new Date()): string => {
  const d = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  const dow = d.getUTCDay(); // 0=Sun..6=Sat, Fri=5
  const delta = (dow + 7 - 5) % 7;
  d.setUTCDate(d.getUTCDate() - delta);
  return d.toISOString().slice(0, 10);
};

export interface DerivedBalance {
  balance: number;
  asOf: string; // YYYY-MM-DD
}

export const deriveOpeningBalance = (
  rows: ParsedTxn[],
  cutoffISO: string = priorFridayISO()
): DerivedBalance | null => {
  const inRange = rows.filter((r) => r.balance != null && r.date <= cutoffISO);
  if (!inRange.length) return null;
  // Latest date ≤ cutoff.
  let maxDate = inRange[0].date;
  for (const r of inRange) if (r.date > maxDate) maxDate = r.date;
  // Last row on that date (in file/insertion order — assumed chronological
  // within a day for SVB BAI and sweep parsers).
  const sameDay = inRange.filter((r) => r.date === maxDate);
  const last = sameDay[sameDay.length - 1];
  return { balance: last.balance as number, asOf: maxDate };
};
