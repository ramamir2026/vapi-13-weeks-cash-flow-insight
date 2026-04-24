// Brex credit card statement parser. Detects card-style statements (vs bank
// account statements) by looking for charge-card keywords like "Statement
// Balance" / "New Balance" / "Total Charges" / "Payment Due", then extracts
// the statement total and the period it covers.
//
// Used to compare the actual monthly card spend against the modeled card
// payment assumption (brex_w2 / brex_w7 / brex_w11) before it hits the cash
// flow model.

import { parseAmount } from "./types";

const CARD_KEYWORDS = [
  "statement balance",
  "new balance",
  "total charges",
  "payment due",
  "minimum payment",
  "previous balance",
];

const TOTAL_KEYWORDS_ORDERED = [
  /new\s+balance/gi,
  /statement\s+balance/gi,
  /total\s+charges?/gi,
  /amount\s+due/gi,
  /payment\s+due/gi,
];

const MONTHS = [
  "january","february","march","april","may","june","july","august","september","october","november","december",
];

const cleanText = (raw: string): string =>
  raw
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

const AMOUNT_RE = /\(?\s*-?\s*\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*\)?/g;

const findNextAmount = (text: string, from: number, windowChars = 160) => {
  const slice = text.slice(from, from + windowChars);
  AMOUNT_RE.lastIndex = 0;
  const m = AMOUNT_RE.exec(slice);
  if (!m) return null;
  const v = parseAmount(m[0]);
  if (!Number.isFinite(v) || v === 0) return null;
  return v;
};

/** Returns true if the text looks like a credit card statement (vs a bank account statement). */
export const isCardStatement = (rawText: string): boolean => {
  const t = rawText.toLowerCase();
  let hits = 0;
  for (const k of CARD_KEYWORDS) if (t.includes(k)) hits++;
  return hits >= 2;
};

/**
 * Pull the statement total. Tries "New Balance" → "Statement Balance" →
 * "Total Charges" in priority order; takes the LAST occurrence so we end up
 * on the summary box at the end of the document.
 */
export const extractCardTotalFromText = (rawText: string): number | null => {
  const text = cleanText(rawText);
  for (const re of TOTAL_KEYWORDS_ORDERED) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let last: number | null = null;
    while ((m = re.exec(text)) !== null) {
      const v = findNextAmount(text, m.index + m[0].length, 160);
      if (v != null && Math.abs(v) >= 100) last = Math.abs(v);
    }
    if (last != null) return last;
  }
  return null;
};

/**
 * Detect the calendar month the statement covers. Returns ISO YYYY-MM-01.
 * Strategy: look for "Statement Period", "Closing Date", "Statement Date",
 * or any "Month YYYY" near the top of the document.
 */
export const extractCardStatementMonth = (rawText: string): string | null => {
  const text = cleanText(rawText);

  // 1) "Statement Period MM/DD/YYYY - MM/DD/YYYY" → use end date's month.
  const periodRe = /(?:statement\s+period|billing\s+period|period)[^0-9]{0,30}(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–to]+\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i;
  const periodMatch = periodRe.exec(text);
  if (periodMatch) {
    const mm = parseInt(periodMatch[4], 10);
    let yy = parseInt(periodMatch[6], 10);
    if (yy < 100) yy += yy < 50 ? 2000 : 1900;
    if (mm >= 1 && mm <= 12) return isoMonth(yy, mm);
  }

  // 2) "Closing Date" / "Statement Date" → use that month.
  const closingRe = /(?:closing\s+date|statement\s+date|period\s+ending)[^0-9A-Za-z]{0,10}([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const closingMatch = closingRe.exec(text);
  if (closingMatch) {
    const parsed = parseLooseDate(closingMatch[1]);
    if (parsed) return isoMonth(parsed.year, parsed.month);
  }

  // 3) "April 2026" / "Apr 2026" anywhere in the first 1500 chars.
  const head = text.slice(0, 1500);
  const monthRe = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b\.?\s+(\d{4})/i;
  const monthMatch = monthRe.exec(head);
  if (monthMatch) {
    const m = monthIndex(monthMatch[1]);
    const y = parseInt(monthMatch[2], 10);
    if (m != null) return isoMonth(y, m + 1);
  }

  return null;
};

const monthIndex = (name: string): number | null => {
  const k = name.toLowerCase().replace(/\.$/, "");
  const short = k.slice(0, 3);
  for (let i = 0; i < MONTHS.length; i++) {
    if (MONTHS[i].startsWith(short)) return i;
  }
  return null;
};

const parseLooseDate = (raw: string): { year: number; month: number; day: number } | null => {
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw.trim());
  if (slash) {
    let y = parseInt(slash[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return { year: y, month: parseInt(slash[1], 10), day: parseInt(slash[2], 10) };
  }
  const word = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(raw.trim());
  if (word) {
    const m = monthIndex(word[1]);
    if (m == null) return null;
    return { year: parseInt(word[3], 10), month: m + 1, day: parseInt(word[2], 10) };
  }
  return null;
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const isoMonth = (y: number, m: number) => `${y}-${pad2(m)}-01`;

/**
 * Map a statement month to the matching card-payment assumption key.
 * Vapi pays the card 1 day after the close of the month, so April statement →
 * paid in W2 (May 1), May statement → W7 (Jun 1), June statement → W11 (Jul 1).
 *
 * If we ever extend beyond June, fall back to the closest assumption key whose
 * label mentions the month.
 */
export const cardAssumptionKeyForMonth = (
  isoFirstOfMonth: string,
  assumptions: { key: string; label: string | null }[],
): string | null => {
  const month = parseInt(isoFirstOfMonth.slice(5, 7), 10);
  // Hard-coded mapping for the three known card assumptions.
  const map: Record<number, string> = { 4: "brex_w2", 5: "brex_w7", 6: "brex_w11" };
  const direct = map[month];
  if (direct) {
    const found = assumptions.find((a) => a.key === direct);
    if (found) return found.key;
  }
  // Fallback: search labels for the month name.
  const monthName = MONTHS[month - 1];
  if (!monthName) return null;
  const fuzzy = assumptions.find((a) =>
    (a.label ?? "").toLowerCase().includes(monthName)
  );
  return fuzzy?.key ?? null;
};

/** Best-effort: extract the total-charges figure from a CSV card export. */
export const extractCardTotalFromCsv = (csv: string): number | null => {
  // Sum all positive amounts in the Amount column — Brex card CSVs use
  // positive numbers for charges and negative for refunds/payments.
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = lines[0].toLowerCase().split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const amountIdx = header.findIndex((h) => h === "amount" || h === "amount usd" || h === "amountusd");
  if (amountIdx === -1) return null;
  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const v = parseAmount(cols[amountIdx] ?? "0");
    if (v > 0) total += v;
  }
  return total > 0 ? total : null;
};
