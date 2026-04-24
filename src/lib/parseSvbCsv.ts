// SVB transaction CSV parser (Date, Description, Amount, Balance).
// Tolerant to header variations and quoted fields. No external deps.

export type SvbCategory =
  | "payroll"
  | "cogs"
  | "card_payments"
  | "rent"
  | "opex"
  | "stripe_revenue"
  | "enterprise_revenue"
  | "ar_collections"
  | "zba_sweep"
  | "unmatched";

export type ParsedSvbRow = {
  id: string; // local-only client id
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // negative = outflow
  balance: number | null;
  category: SvbCategory;
  weekStart: string; // YYYY-MM-DD (Monday)
};

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

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER_MAP: Record<string, "date" | "description" | "amount" | "balance"> = {
  date: "date",
  postingdate: "date",
  transactiondate: "date",
  description: "description",
  memo: "description",
  details: "description",
  amount: "amount",
  transactionamount: "amount",
  balance: "balance",
  runningbalance: "balance",
  endingbalance: "balance",
};

const parseAmount = (s: string): number => {
  if (!s) return 0;
  const cleaned = s
    .replace(/[$,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const toIsoDate = (s: string): string | null => {
  if (!s) return null;
  const trimmed = s.trim();
  // Accept MM/DD/YYYY, YYYY-MM-DD, M/D/YY etc.
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const mondayOf = (iso: string): string => {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
};

export const autoCategorize = (description: string): SvbCategory => {
  const d = description.toLowerCase();
  if (d.includes("sequoia one")) return "payroll";
  if (d.includes("sweep") || d.includes("transfer to")) return "zba_sweep";
  return "unmatched";
};

export const parseSvbCsv = (text: string): ParsedSvbRow[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Find header row
  let headerIdx = 0;
  let headerKey: Array<keyof typeof HEADER_MAP | string | null> = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = splitCsvLine(lines[i]);
    const mapped = cols.map((c) => HEADER_MAP[normalize(c)] ?? null);
    if (mapped.filter(Boolean).length >= 2 && mapped.includes("date") && mapped.includes("amount")) {
      headerIdx = i;
      headerKey = mapped;
      break;
    }
  }
  if (headerKey.length === 0) return [];

  const rows: ParsedSvbRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;

    const rec: Record<string, string> = {};
    cols.forEach((val, idx) => {
      const k = headerKey[idx];
      if (k) rec[k] = val;
    });

    const date = toIsoDate(rec.date || "");
    const description = (rec.description || "").trim();
    const amount = parseAmount(rec.amount || "0");
    const balanceRaw = rec.balance;
    const balance = balanceRaw ? parseAmount(balanceRaw) : null;
    if (!date || !description || amount === 0) continue;

    const category = autoCategorize(description);
    rows.push({
      id: `${i}-${date}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      description,
      amount,
      balance,
      category,
      weekStart: mondayOf(date),
    });
  }
  return rows;
};

export const CATEGORY_LABEL: Record<SvbCategory, string> = {
  payroll: "Payroll",
  cogs: "COGS",
  card_payments: "Card Payments",
  rent: "Rent",
  opex: "OPEX",
  stripe_revenue: "Stripe Revenue",
  enterprise_revenue: "Enterprise Revenue",
  ar_collections: "A/R Collections",
  zba_sweep: "ZBA Sweep (excluded)",
  unmatched: "Unmatched",
};

// Categories that map to actuals row keys in weekly_actuals.notes JSON.
// Keys must match those used by the Dashboard ForecastGrid (see actualKey props).
export const CATEGORY_TO_ACTUAL_KEY: Partial<Record<SvbCategory, string>> = {
  payroll: "payroll",
  cogs: "cogs_total",
  card_payments: "brexCard",
  rent: "rent",
  opex: "opex_total",
  stripe_revenue: "stripeRevenue",
  enterprise_revenue: "enterpriseRevenue",
  ar_collections: "arCollections",
};
