// Parser for QuickBooks A/R Aging Summary CSV exports.
// Each customer row has aging-bucket columns (Current, 1-30, 31-60, 61-90, >90).
// We expand each non-zero bucket into a separate ParsedArRow so the user sees
// one preview line per bucket and can adjust the expected week.

export type ParsedArRow = {
  customer: string;
  invoiceNumber: string;
  amount: number;
  agingDays: number;       // representative day count for the bucket
  invoiceDate: string;     // YYYY-MM-DD (synthesized from agingDays)
  probability: number;     // 0..1
  expectedWeek: number;    // 1..13
  bucketLabel: string;     // "Current" | "1-30" | "31-60" | "61-90" | "91+"
};

export class ArCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArCsvParseError";
  }
}

const FORMAT_ERROR =
  "This does not look like an A/R Aging Summary. " +
  "Please export from Reports → Aging → A/R Aging Summary in QuickBooks, " +
  "or the A/R Aging report in Rillet.";

// ----- Aging bucket definitions ---------------------------------------------

type BucketKey = "current" | "b1_30" | "b31_60" | "b61_90" | "b91_plus";

type BucketDef = {
  key: BucketKey;
  label: string;
  representativeDays: number;
  probability: number;
  expectedWeek: number; // deterministic per QuickBooks A/R Aging spec
};

// Per collections policy:
//   CURRENT  → 100%, W1
//   1-30     → 90%,  W2
//   31-60    → 75%,  W4
//   61-90    → 60%,  W7
//   91+      → 30%,  W10
const BUCKETS: Record<BucketKey, BucketDef> = {
  current:  { key: "current",  label: "Current", representativeDays: 0,   probability: 1.0,  expectedWeek: 1 },
  b1_30:    { key: "b1_30",    label: "1-30",    representativeDays: 15,  probability: 0.9,  expectedWeek: 2 },
  b31_60:   { key: "b31_60",   label: "31-60",   representativeDays: 45,  probability: 0.75, expectedWeek: 4 },
  b61_90:   { key: "b61_90",   label: "61-90",   representativeDays: 75,  probability: 0.6,  expectedWeek: 7 },
  b91_plus: { key: "b91_plus", label: "91+",     representativeDays: 120, probability: 0.3,  expectedWeek: 10 },
};

export const probabilityForAging = (days: number): number => {
  if (days <= 0) return 1.0;
  if (days <= 30) return 0.9;
  if (days <= 60) return 0.75;
  if (days <= 90) return 0.6;
  return 0.3;
};

// ----- Header matching ------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Map a normalized header cell → bucket key. Handles common QuickBooks and
// Rillet variants (e.g. "1-30 days", "90+ days", "Aging Current").
const matchBucketHeader = (raw: string): BucketKey | null => {
  let n = norm(raw);
  if (!n) return null;
  // Rillet affixes: "Aging Current" → "current"; "1-30 days" → "130".
  n = n.replace(/^aging/, "");
  n = n.replace(/days$/, "");
  if (!n) return null;
  if (n === "current" || n === "notdue" || n === "030") return "current";
  if (n === "130" || n === "1to30" || n === "0130") return "b1_30";
  if (n === "3160" || n === "31to60") return "b31_60";
  if (n === "6190" || n === "61to90") return "b61_90";
  // 91+, >90, over 90, 91 and over, 91andover, 91plus, greaterthan90,
  // and Rillet's "90+ days" which normalizes to "90" after stripping "days".
  if (
    n === "91andover" ||
    n === "91plus" ||
    n === "91" ||
    n === "90" ||
    n === "over90" ||
    n === "greaterthan90" ||
    n === "morethan90" ||
    n.endsWith("90") && (n.startsWith("over") || n.startsWith("gt") || n.startsWith("greater") || n.startsWith("morethan")) ||
    n === "90plus" ||
    n === "90andover"
  ) {
    return "b91_plus";
  }
  return null;
};

const isCustomerHeader = (raw: string): boolean => {
  const n = norm(raw);
  return n === "customer" || n === "customername" || n === "name" || n === "client";
};

// ----- CSV tokenizer --------------------------------------------------------

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

// ----- Header row detection -------------------------------------------------

type HeaderInfo = {
  rowIndex: number;
  customerCol: number;
  bucketCols: Partial<Record<BucketKey, number>>;
  totalCol: number | null;
};

const detectHeader = (lines: string[]): HeaderInfo | null => {
  // QuickBooks usually emits the column headers within the first ~12 rows.
  const scanLimit = Math.min(lines.length, 15);
  for (let i = 0; i < scanLimit; i++) {
    const cols = splitCsvLine(lines[i]);
    let customerCol = -1;
    const bucketCols: Partial<Record<BucketKey, number>> = {};
    let totalCol: number | null = null;

    cols.forEach((c, idx) => {
      if (customerCol === -1 && isCustomerHeader(c)) {
        customerCol = idx;
        return;
      }
      const b = matchBucketHeader(c);
      if (b && bucketCols[b] === undefined) {
        bucketCols[b] = idx;
        return;
      }
      if (totalCol === null && norm(c) === "total") {
        totalCol = idx;
      }
    });

    // QuickBooks A/R Aging Summary often leaves the customer header cell blank.
    // If we found aging buckets but no customer column, assume column 0.
    if (customerCol === -1 && Object.keys(bucketCols).length >= 2) {
      const firstBucketCol = Math.min(
        ...(Object.values(bucketCols) as number[]),
      );
      if (firstBucketCol > 0) {
        customerCol = 0;
      }
    }

    // Accept the row if we found a customer column AND at least one aging bucket.
    if (customerCol !== -1 && Object.keys(bucketCols).length >= 1) {
      return { rowIndex: i, customerCol, bucketCols, totalCol };
    }
  }
  return null;
};

// ----- Main entry point -----------------------------------------------------

const todayIso = () => new Date().toISOString().slice(0, 10);

const subDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export type ParseArCsvOptions = {
  /** Days to shift expected collection weeks (from assumptions.ar_delay_days). */
  arDelayDays?: number;
};

export const parseArCsv = (
  rawText: string,
  options: ParseArCsvOptions = {},
): ParsedArRow[] => {
  if (!rawText || !rawText.trim()) {
    throw new ArCsvParseError("The file is empty.");
  }

  // Strip BOM, normalize CRLF → LF, drop blank lines.
  const text = stripBom(rawText).replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new ArCsvParseError(FORMAT_ERROR);
  }

  const header = detectHeader(lines);
  if (!header) {
    throw new ArCsvParseError(FORMAT_ERROR);
  }

  const today = todayIso();
  const arDelayDays = Math.max(0, options.arDelayDays ?? 0);
  const arDelayWeeks = Math.round(arDelayDays / 7);

  const out: ParsedArRow[] = [];

  for (let i = header.rowIndex + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;

    const customerRaw = (cols[header.customerCol] ?? "").trim();
    if (!customerRaw) continue;

    // Skip subtotal / total rows.
    if (/^(total|grand\s*total|subtotal)\b/i.test(customerRaw)) continue;

    // Expand each non-zero bucket into its own ParsedArRow.
    (Object.keys(BUCKETS) as BucketKey[]).forEach((key) => {
      const colIdx = header.bucketCols[key];
      if (colIdx === undefined) return;
      const cell = cols[colIdx];
      const amount = parseAmount(cell ?? "");
      if (!amount) return;

      const def = BUCKETS[key];
      const expectedWeek = Math.min(13, Math.max(1, def.expectedWeek + arDelayWeeks));

      out.push({
        customer: customerRaw,
        invoiceNumber: "",
        amount,
        agingDays: def.representativeDays,
        invoiceDate: subDays(today, def.representativeDays),
        probability: def.probability,
        expectedWeek,
        bucketLabel: def.label,
      });
    });
  }

  if (out.length === 0) {
    throw new ArCsvParseError(
      "No customer rows with non-zero balances were found in this report."
    );
  }

  return out;
};
