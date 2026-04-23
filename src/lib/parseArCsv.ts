// Lightweight CSV parser tolerant to QuickBooks A/R Aging Summary exports.
// No external deps.

export type ParsedArRow = {
  customer: string;
  invoiceNumber: string;
  amount: number;
  agingDays: number;
  invoiceDate: string; // YYYY-MM-DD
  probability: number; // 0..1
  expectedWeek: number; // 1..13
};

const PROB_BY_BUCKET = (days: number): number => {
  if (days <= 30) return 0.9;
  if (days <= 60) return 0.75;
  if (days <= 90) return 0.5;
  return 0.2;
};

// 0–30 → W1–W2 (round-robin), 31–60 → W3–W5, 61–90 → W6–W8, 90+ → W9–W10
const weekForBucket = (days: number, counterRef: { c: Record<string, number> }): number => {
  const pick = (label: string, options: number[]) => {
    const i = (counterRef.c[label] ?? 0) % options.length;
    counterRef.c[label] = (counterRef.c[label] ?? 0) + 1;
    return options[i];
  };
  if (days <= 30) return pick("a", [1, 2]);
  if (days <= 60) return pick("b", [3, 4, 5]);
  if (days <= 90) return pick("c", [6, 7, 8]);
  return pick("d", [9, 10]);
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

const HEADER_MAP: Record<string, "customer" | "invoiceNumber" | "amount" | "agingDays" | "dueDate" | "invoiceDate"> = {
  customer: "customer",
  customername: "customer",
  name: "customer",
  invoice: "invoiceNumber",
  invoiceno: "invoiceNumber",
  invoicenumber: "invoiceNumber",
  num: "invoiceNumber",
  number: "invoiceNumber",
  invoiceamount: "amount",
  amount: "amount",
  openbalance: "amount",
  balance: "amount",
  agingdays: "agingDays",
  daysoverdue: "agingDays",
  dayspastdue: "agingDays",
  aging: "agingDays",
  duedate: "dueDate",
  invoicedate: "invoiceDate",
  date: "invoiceDate",
};

const parseAmount = (s: string): number => {
  const cleaned = s.replace(/[$,\s]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const toIsoDate = (s: string): string | null => {
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const daysBetween = (aIso: string, bIso: string) => {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.round((a - b) / 86400000);
};

const subDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export const parseArCsv = (text: string): ParsedArRow[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Find header row: the first line containing at least one recognized header
  let headerIdx = 0;
  let headerCols: string[] = [];
  let headerKey: Array<keyof typeof HEADER_MAP | string | null> = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = splitCsvLine(lines[i]);
    const mapped = cols.map((c) => HEADER_MAP[normalize(c)] ?? null);
    if (mapped.filter(Boolean).length >= 2) {
      headerIdx = i;
      headerCols = cols;
      headerKey = mapped;
      break;
    }
  }
  if (headerCols.length === 0) return [];

  const today = todayIso();
  const counter = { c: {} as Record<string, number> };
  const rows: ParsedArRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;

    const rec: Record<string, string> = {};
    cols.forEach((val, idx) => {
      const k = headerKey[idx];
      if (k) rec[k] = val;
    });

    const customer = (rec.customer || "").trim();
    const amount = parseAmount(rec.amount || "0");
    if (!customer || amount === 0) continue;
    // Skip total/subtotal rows
    if (/^(total|grand total|subtotal)/i.test(customer)) continue;

    let agingDays = parseInt((rec.agingDays || "").replace(/[^\d-]/g, ""), 10);
    let invoiceDate = toIsoDate(rec.invoiceDate || "");
    if (!Number.isFinite(agingDays)) {
      const due = toIsoDate(rec.dueDate || "");
      if (due) agingDays = Math.max(0, daysBetween(today, due));
      else if (invoiceDate) agingDays = Math.max(0, daysBetween(today, invoiceDate));
      else agingDays = 0;
    }
    if (!invoiceDate) invoiceDate = subDays(today, agingDays);

    const probability = PROB_BY_BUCKET(agingDays);
    const expectedWeek = weekForBucket(agingDays, counter);

    rows.push({
      customer,
      invoiceNumber: (rec.invoiceNumber || "").trim(),
      amount,
      agingDays,
      invoiceDate,
      probability,
      expectedWeek,
    });
  }

  return rows;
};

export const probabilityForAging = PROB_BY_BUCKET;
