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

export const parseAmount = (s: string): number => {
  if (!s) return 0;
  const cleaned = s
    .replace(/[$,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export const toIsoDate = (s: string): string | null => {
  if (!s) return null;
  const d = new Date(s.trim());
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
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
export const autoCategorize = (vendor: string, _source: BankSource): string => {
  const v = vendor.toLowerCase();
  if (v.includes("sweep") || v.includes("transfer to") || v.includes("transfer from")) return "zba_sweep";
  if (v.includes("sequoia one")) return "payroll";
  if (v.includes("stripe payout") || v.includes("stripe transfer")) return "stripe_revenue";
  if (v.includes("anthropic") || v.includes("openai") || v.includes("azure") || v.includes("deepgram") || v.includes("elevenlabs") || v.includes("twilio") || v.includes("aws")) return "cogs";
  if (v.includes("rent") || v.includes("landlord")) return "rent";
  return "unmatched";
};
