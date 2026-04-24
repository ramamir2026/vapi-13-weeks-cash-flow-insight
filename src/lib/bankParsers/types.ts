// Shared types for the multi-bank CSV parser system.

export type BankSource =
  | "brex_primary"
  | "brex_treasury"
  | "brex_stripe_clearing"
  | "svb_checking"
  | "svb_money_market"
  | "stripe";

export const BANK_LABEL: Record<BankSource, string> = {
  brex_primary: "Brex Primary",
  brex_treasury: "Brex Treasury",
  brex_stripe_clearing: "Brex Stripe Clearing",
  svb_checking: "SVB Analysis Checking",
  svb_money_market: "SVB Money Market",
  stripe: "Stripe",
};

// Maps each bank source to the assumption key that holds its opening cash balance.
export const BANK_TO_ASSUMPTION_KEY: Record<BankSource, string> = {
  brex_primary: "cash_brex_primary",
  brex_treasury: "cash_brex_treasury",
  brex_stripe_clearing: "cash_stripe_clearing",
  svb_checking: "cash_svb_checking",
  svb_money_market: "cash_svb_mm",
  stripe: "cash_stripe_clearing",
};

export type ParsedTxn = {
  // Local-only id for table state.
  id: string;
  date: string; // YYYY-MM-DD
  vendor: string;
  amount: number; // negative = outflow
  balance: number | null;
  category: string;
  bank_source: BankSource;
};

export type DetectionResult = {
  source: BankSource;
  confidence: "high" | "medium" | "low";
  rows: ParsedTxn[];
  warnings: string[];
};

// Strip UTF-8 BOM and normalize CRLF → LF. Always run on raw file text first.
export const stripBom = (s: string): string =>
  s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;

export const normalizeText = (s: string): string =>
  stripBom(s).replace(/\r\n?/g, "\n");

// Shared CSV line splitter (handles quoted fields with embedded commas/quotes).
export const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        q = !q;
      }
    } else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Parse "$1,234.56", "-$1,234.56", "($1,234.56)", "1234.56" → signed number.
export const parseAmount = (s: string): number => {
  if (!s) return 0;
  let t = s.trim();
  let neg = false;
  // Parentheses → negative.
  const paren = /^\((.*)\)$/.exec(t);
  if (paren) {
    neg = true;
    t = paren[1];
  }
  // Leading minus.
  if (t.startsWith("-")) {
    neg = !neg;
    t = t.slice(1);
  }
  // Strip currency, spaces, commas.
  t = t.replace(/[$,\s]/g, "");
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  return neg ? -Math.abs(n) : n;
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const isoFromYMD = (y: number, m: number, d: number): string | null => {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
};

// Parse common date formats without timezone drift.
export const toIsoDate = (raw: string): string | null => {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // 2026-01-15 or 2026-1-5 (also tolerate trailing time)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return isoFromYMD(+iso[1], +iso[2], +iso[3]);

  // 01/15/2026 or 1/5/26
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (slash) {
    let y = +slash[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return isoFromYMD(y, +slash[1], +slash[2]);
  }

  // Jan 15 2026 / Jan 15, 2026 / January 15 2026
  const monFirst = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (monFirst) {
    const m = MONTHS[monFirst[1].slice(0, 3).toLowerCase()];
    if (m != null) return isoFromYMD(+monFirst[3], m + 1, +monFirst[2]);
  }

  // 15 Jan 2026
  const dayFirst = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  if (dayFirst) {
    const m = MONTHS[dayFirst[2].slice(0, 3).toLowerCase()];
    if (m != null) return isoFromYMD(+dayFirst[3], m + 1, +dayFirst[1]);
  }

  // Last-resort fallback (may drift by tz, but better than failing).
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return isoFromYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
};

export const mondayOf = (iso: string): string => {
  const d = new Date(iso);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
};

export const rid = () => Math.random().toString(36).slice(2, 10);

// Default rule-based auto-categorization. Rules from bank_category_rules
// (vendor contains text → category) override this in the page layer.
// All matches are lowercase substring checks.
const RULES: Array<{ keys: string[]; category: string }> = [
  { keys: ["sweep", "transfer to", "transfer from", "brex treasury"], category: "zba_sweep" },
  { keys: ["sequoia one"], category: "payroll" },
  { keys: ["stripe payout", "stripe transfer"], category: "stripe_revenue" },
  { keys: ["anthropic", "openai", "azure", "deepgram", "elevenlabs", "twilio", "pump"], category: "cogs" },
  { keys: ["brex inc"], category: "card_payments" },
  { keys: ["montgomery", "supervisor", "creators corner", "pianta"], category: "sm" },
  { keys: ["prizm", "execcatalyst", "candidate labs"], category: "recruiting" },
  { keys: ["hogan lovells", "cti iii", "vat compliance"], category: "legal" },
  { keys: ["deel"], category: "deel" },
  { keys: ["navan", "121 silicon"], category: "hre" },
  { keys: ["true capital", "landlord"], category: "rent" },
  { keys: ["kitchens", "anrok", "franchise tax", "nys dtf", "intuit", "cbf"], category: "ga" },
  { keys: ["versaconnect", "unityai", "reinform", "alto pharmacy", "monday.com"], category: "ar_collections" },
];

export const autoCategorize = (vendor: string, _source: BankSource): string => {
  const v = vendor.toLowerCase();
  if (v.includes('sweep') || v.includes('transfer to') || v.includes('transfer from') || v.includes('brex treasury')) return 'zba_sweep';
  if (v.includes('sequoia one')) return 'payroll';
  if (v.includes('stripe payout') || v.includes('stripe transfer')) return 'stripe_revenue';
  if (v.includes('anthropic') || v.includes('openai') || v.includes('azure') || v.includes('deepgram') || v.includes('elevenlabs') || v.includes('twilio') || v.includes('pump')) return 'cogs';
  if (v.includes('brex inc')) return 'card_payments';
  if (v.includes('montgomery') || v.includes('supervisor') || v.includes('creators corner') || v.includes('pianta') || v.includes('martin sign')) return 'sm';
  if (v.includes('prizm') || v.includes('execcatalyst') || v.includes('candidate labs') || v.includes('launch search')) return 'recruiting';
  if (v.includes('hogan lovells') || v.includes('cti iii') || v.includes('vat compliance')) return 'legal';
  if (v.includes('deel')) return 'deel';
  if (v.includes('navan') || v.includes('121 silicon')) return 'hre';
  if (v.includes('true capital') || v.includes('landlord')) return 'rent';
  if (v.includes('kitchens') || v.includes('anrok') || v.includes('franchise tax') || v.includes('nys dtf') || v.includes('intuit') || v.includes('cbf')) return 'ga';
  if (v.includes('versaconnect') || v.includes('unityai') || v.includes('reinform') || v.includes('alto pharmacy') || v.includes('monday.com')) return 'ar_collections';
  return 'unmatched';
};
