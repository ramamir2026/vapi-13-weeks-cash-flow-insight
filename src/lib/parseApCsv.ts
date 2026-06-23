// Parser for the Rillet "AP Aging Details Report" sheet.
// Reads vendor bills (Name / Expense Due Date / Total Outstanding), maps the 8
// AI/Infra COGS vendors by name, applies the same weekend-forward rule the
// calendar pay-day model uses, and buckets dollars into W1..W5 of the current
// forecast window.
//
// IMPORTANT discipline: ONLY the mapped COGS vendors are emitted. Unmapped
// vendors (recruiting, legal, G&A, Oracle, etc.) are excluded entirely — they
// are already modeled in OpEx and mapping them to COGS would double-count.
// `cogs_other` is NEVER driven from AP; it stays smoothed from assumptions.

export class ApCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApCsvParseError";
  }
}

const FORMAT_ERROR =
  "This does not look like an AP Aging Details report. " +
  "Please export the A/P Aging Details (or AP Aging) report from Rillet/QuickBooks.";

export type ApVendorKey =
  | "cogs_anthropic"
  | "cogs_openai"
  | "cogs_deepgram"
  | "cogs_azure"
  | "cogs_pump_aws"
  | "cogs_elevenlabs"
  | "cogs_gemini"
  | "cogs_twilio";

export const AP_VENDOR_LABELS: Record<ApVendorKey, string> = {
  cogs_anthropic: "Anthropic",
  cogs_openai: "OpenAI",
  cogs_deepgram: "Deepgram",
  cogs_azure: "Azure",
  cogs_pump_aws: "Pump/AWS",
  cogs_elevenlabs: "ElevenLabs",
  cogs_gemini: "Google / Gemini",
  cogs_twilio: "Twilio",
};

export const AP_HORIZON_WEEKS = 5;

export type ParsedApBill = {
  vendor: string;       // original vendor name from the file
  vendorKey: ApVendorKey;
  dueDate: string;      // YYYY-MM-DD (adjusted forward for Sat/Sun)
  rawDueDate: string;   // YYYY-MM-DD as parsed before weekend adjustment
  amount: number;
  weekIndex: number;    // 0..AP_HORIZON_WEEKS-1
};

export type ParsedApResult = {
  bills: ParsedApBill[];
  weeksByVendor: Record<string, number[]>; // key -> length-5 array, only mapped vendors that appear
  weeksTotal: number[];                    // length-5
  outOfHorizon: number;                    // $ of mapped bills due after W5
  nonCogsSkipped: number;                  // count of rows excluded because vendor was not a mapped COGS vendor
  forecastStartIso: string;                // Monday window anchor
};

// ----- vendor mapping ------------------------------------------------------
// Lower-cased, normalized "contains" matching. Order matters only when one
// token is a prefix of another (none here are).
const VENDOR_PATTERNS: Array<{ key: ApVendorKey; patterns: string[] }> = [
  { key: "cogs_anthropic", patterns: ["anthropic"] },
  { key: "cogs_openai", patterns: ["openai", "open ai"] },
  { key: "cogs_deepgram", patterns: ["deepgram"] },
  { key: "cogs_azure", patterns: ["azure", "microsoft azure"] },
  { key: "cogs_pump_aws", patterns: ["pump", "aws", "amazon web"] },
  { key: "cogs_elevenlabs", patterns: ["elevenlabs", "eleven labs"] },
  // Narrow Gemini token — never bare "google" (would catch Google Workspace).
  { key: "cogs_gemini", patterns: ["gemini", "google gemini", "google cloud"] },
  { key: "cogs_twilio", patterns: ["twilio"] },
];

const mapVendor = (name: string): ApVendorKey | null => {
  const n = name.toLowerCase();
  if (!n.trim()) return null;
  for (const { key, patterns } of VENDOR_PATTERNS) {
    for (const p of patterns) {
      if (n.includes(p)) return key;
    }
  }
  return null;
};

// ----- header detection ----------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const isVendorHeader = (raw: string): boolean => {
  const n = norm(raw);
  return n === "name" || n === "vendor" || n === "vendorname" || n === "payee";
};

const isDueDateHeader = (raw: string): boolean => {
  const n = norm(raw);
  return (
    n === "expenseduedate" ||
    n === "duedate" ||
    n === "billduedate" ||
    n === "due"
  );
};

const isAmountHeader = (raw: string): boolean => {
  const n = norm(raw);
  return (
    n === "totaloutstanding" ||
    n === "openbalance" ||
    n === "amountdue" ||
    n === "balance" ||
    n === "outstanding"
  );
};

// ----- CSV tokenizer -------------------------------------------------------

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

const parseAmount = (s: string): number => {
  if (!s) return 0;
  let t = s.trim();
  let neg = false;
  const paren = /^\((.*)\)$/.exec(t);
  if (paren) {
    neg = true;
    t = paren[1];
  }
  if (t.startsWith("-")) {
    neg = !neg;
    t = t.slice(1);
  }
  t = t.replace(/[$,\s]/g, "");
  if (!t) return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  return neg ? -Math.abs(n) : n;
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const parseDate = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    const y = +iso[1], m = +iso[2], d = +iso[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  // M/D/YYYY
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (us) {
    const m = +us[1], d = +us[2];
    let y = +us[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  }
  return null;
};

// Weekend-forward: Sat -> Mon, Sun -> Mon. Operates on YYYY-MM-DD strings to
// stay timezone-clean (matches the parser's date contract).
const adjustForwardIso = (iso: string): string => {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun, 6=Sat
  const shift = dow === 6 ? 2 : dow === 0 ? 1 : 0;
  if (shift === 0) return iso;
  dt.setUTCDate(dt.getUTCDate() + shift);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

const daysBetweenIso = (aIso: string, bIso: string): number => {
  const [ay, am, ad] = aIso.split("-").map((p) => parseInt(p, 10));
  const [by, bm, bd] = bIso.split("-").map((p) => parseInt(p, 10));
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.floor((b - a) / 86_400_000);
};

// ----- header row detection ------------------------------------------------

type HeaderInfo = {
  rowIndex: number;
  vendorCol: number;
  dueCol: number;
  amountCol: number;
};

const detectHeader = (lines: string[]): HeaderInfo | null => {
  const scanLimit = Math.min(lines.length, 20);
  for (let i = 0; i < scanLimit; i++) {
    const cols = splitCsvLine(lines[i]);
    let vendorCol = -1, dueCol = -1, amountCol = -1;
    cols.forEach((c, idx) => {
      if (vendorCol === -1 && isVendorHeader(c)) vendorCol = idx;
      else if (dueCol === -1 && isDueDateHeader(c)) dueCol = idx;
      else if (amountCol === -1 && isAmountHeader(c)) amountCol = idx;
    });
    if (vendorCol >= 0 && dueCol >= 0 && amountCol >= 0) {
      return { rowIndex: i, vendorCol, dueCol, amountCol };
    }
  }
  return null;
};

// ----- main entry ----------------------------------------------------------

export type ParseApCsvOptions = {
  /** Forecast window anchor (Monday). YYYY-MM-DD. */
  forecastStartIso: string;
};

export const parseApCsv = (
  rawText: string,
  options: ParseApCsvOptions,
): ParsedApResult => {
  if (!rawText || !rawText.trim()) {
    throw new ApCsvParseError("The file is empty.");
  }
  const forecastStartIso = options.forecastStartIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forecastStartIso)) {
    throw new ApCsvParseError("forecastStartIso must be a YYYY-MM-DD Monday.");
  }

  const text = stripBom(rawText).replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new ApCsvParseError(FORMAT_ERROR);

  const header = detectHeader(lines);
  if (!header) throw new ApCsvParseError(FORMAT_ERROR);

  const bills: ParsedApBill[] = [];
  const weeksByVendor: Record<string, number[]> = {};
  const weeksTotal = new Array(AP_HORIZON_WEEKS).fill(0);
  let outOfHorizon = 0;
  let nonCogsSkipped = 0;

  for (let i = header.rowIndex + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;

    const vendorRaw = (cols[header.vendorCol] ?? "").trim();
    if (!vendorRaw) continue;
    // Skip subtotal/total rows.
    if (/^(total|grand\s*total|subtotal)\b/i.test(vendorRaw)) continue;

    const amount = parseAmount(cols[header.amountCol] ?? "");
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const dueRaw = (cols[header.dueCol] ?? "").trim();
    const due = parseDate(dueRaw);
    if (!due) continue;

    const vendorKey = mapVendor(vendorRaw);
    if (!vendorKey) {
      nonCogsSkipped++;
      continue;
    }

    const adjusted = adjustForwardIso(due);
    const dayDelta = daysBetweenIso(forecastStartIso, adjusted);
    // Past-due (negative) clamps into W1. W6+ counts toward outOfHorizon.
    const weekIndex = dayDelta < 0 ? 0 : Math.floor(dayDelta / 7);

    if (weekIndex >= AP_HORIZON_WEEKS) {
      outOfHorizon += amount;
      continue;
    }

    bills.push({
      vendor: vendorRaw,
      vendorKey,
      dueDate: adjusted,
      rawDueDate: due,
      amount,
      weekIndex,
    });

    if (!weeksByVendor[vendorKey]) {
      weeksByVendor[vendorKey] = new Array(AP_HORIZON_WEEKS).fill(0);
    }
    weeksByVendor[vendorKey][weekIndex] += amount;
    weeksTotal[weekIndex] += amount;
  }

  if (bills.length === 0 && nonCogsSkipped === 0 && outOfHorizon === 0) {
    throw new ApCsvParseError(
      "No vendor rows with non-zero balances were found in this report."
    );
  }

  return {
    bills,
    weeksByVendor,
    weeksTotal,
    outOfHorizon,
    nonCogsSkipped,
    forecastStartIso,
  };
};
