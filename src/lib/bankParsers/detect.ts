// Bank source auto-detector. Scores header rows by recognized tokens so it
// works on real-world exports where exact column names vary, then dispatches
// to the matching parser. Always returns the parser's result (even 0 rows)
// so the UI can show the user *why* nothing parsed instead of failing silently.
import { parseBrexCsv } from "./brex";
import { parseStripeCsv } from "./stripe";
import { parseSvbCheckingCsv } from "./svbChecking";
import { parseSvbMoneyMarketCsv } from "./svbMoneyMarket";
import {
  BankSource,
  DetectionResult,
  norm,
  normalizeText,
  splitCsvLine,
} from "./types";

const filenameHint = (filename: string): BankSource | null => {
  const f = filename.toLowerCase();
  if (f.includes("ramp") && f.includes("treasury")) return "ramp_treasury";
  if (f.includes("ramp")) return "ramp_checking";
  if (f.includes("treasury")) return "brex_treasury";
  if (
    f.includes("stripe_clearing") ||
    f.includes("stripe-clearing") ||
    f.includes("clearing")
  )
    return "brex_stripe_clearing";
  if (f.includes("brex")) return "brex_primary";
  if (
    f.includes("money_market") ||
    f.includes("moneymarket") ||
    f.includes("sweep") ||
    /(^|[^a-z])mm([^a-z]|$)/.test(f)
  )
    return "svb_money_market";
  if (f.includes("svb")) return "svb_checking";
  if (f.includes("stripe")) return "stripe";
  return null;
};

// Recognised header tokens (already passed through `norm` → lowercase, alnum only).
const TOKENS = {
  date: ["date", "postingdate", "postedat", "transactiondate", "initiateddate", "availableondate", "createdutc", "created"],
  amount: ["amount", "amountusd", "transactionamount", "net", "gross"],
  credit: ["credit", "credits", "deposit", "deposits"],
  debit: ["debit", "debits", "withdrawal", "withdrawals"],
  description: ["description", "memo", "details", "tofrom", "merchant", "payee", "counterparty", "type", "reportingcategory"],
  balance: ["balance", "runningbalance", "endingbalance"],
  status: ["status"],
  brex: ["tofrom", "accountnumberlastfour", "accountlastfour", "last4"],
};

const hasAny = (cols: string[], tokens: string[]) =>
  tokens.some((t) => cols.includes(t));

// Score each candidate header line by how many token groups it covers.
const scoreHeader = (cols: string[]): number => {
  let s = 0;
  if (hasAny(cols, TOKENS.date)) s += 1;
  if (hasAny(cols, TOKENS.amount) || hasAny(cols, TOKENS.credit) || hasAny(cols, TOKENS.debit)) s += 1;
  if (hasAny(cols, TOKENS.description)) s += 1;
  if (hasAny(cols, TOKENS.balance)) s += 1;
  if (hasAny(cols, TOKENS.brex)) s += 1;
  return s;
};

// Find the best header row in the first 20 non-empty lines.
const findHeader = (text: string): { cols: string[]; raw: string } | null => {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  let best: { cols: string[]; raw: string; score: number } | null = null;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cols = splitCsvLine(lines[i]).map(norm);
    const s = scoreHeader(cols);
    if (s >= 2 && (!best || s > best.score)) {
      best = { cols, raw: lines[i], score: s };
    }
  }
  return best ? { cols: best.cols, raw: best.raw } : null;
};

export const detectAndParse = (
  rawText: string,
  filename: string
): DetectionResult => {
  const text = normalizeText(rawText);
  const hint = filenameHint(filename);
  const warnings: string[] = [];

  const header = findHeader(text);
  if (!header) {
    return {
      source: hint ?? "brex_primary",
      confidence: "low",
      rows: [],
      warnings: [
        "Could not find a recognizable header row (looked for Date / Amount / Description columns). Re-export from your bank or remove extra summary rows at the top of the file.",
      ],
    };
  }

  const cols = header.cols;
  const hasCredit = hasAny(cols, TOKENS.credit);
  const hasDebit = hasAny(cols, TOKENS.debit);
  const hasBrex = hasAny(cols, TOKENS.brex);
  const hasBalance = hasAny(cols, TOKENS.balance);
  const hasDescription = hasAny(cols, TOKENS.description);
  const hasAmount = hasAny(cols, TOKENS.amount);

  // Pick source from header signals; filename only breaks ties or refines flavour.
  let source: BankSource;
  let confidence: "high" | "medium" | "low" = "high";

  // Ramp filename hint takes priority — Ramp CSVs share Brex-like columns.
  if (hint === "ramp_checking" || hint === "ramp_treasury") {
    source = hint;
  } else if (hasBrex) {
    source =
      hint === "brex_treasury" || hint === "brex_stripe_clearing"
        ? hint
        : "brex_primary";
  } else if (hasCredit && hasDebit) {
    source = "svb_money_market";
  } else if (hasDescription && hasAmount && hasBalance) {
    // Ambiguous — SVB Checking and Stripe (with balance column) share this shape.
    if (hint === "stripe") {
      source = "stripe";
    } else {
      source = "svb_checking";
      if (!hint) {
        confidence = "medium";
        warnings.push(
          "Headers match both SVB Checking and Stripe formats — confirm bank source before importing."
        );
      }
    }
  } else if (hasDescription && hasAmount) {
    source = "stripe";
  } else if (hasAmount) {
    // Bare-bones export — fall back to Stripe-style parsing.
    source = hint ?? "stripe";
    confidence = "medium";
    warnings.push(
      "Header row is missing some expected columns; defaulted based on filename. Confirm before importing."
    );
  } else {
    return {
      source: hint ?? "brex_primary",
      confidence: "low",
      rows: [],
      warnings: ["Header row was found but no Amount / Credit / Debit column was recognised."],
    };
  }

  // Filename disagreement → confidence drop + warning (same-family flavours allowed).
  if (hint && hint !== source) {
    const sameBrexFamily = hint.startsWith("brex_") && source.startsWith("brex_");
    const sameRampFamily = hint.startsWith("ramp_") && source.startsWith("ramp_");
    if (!sameBrexFamily && !sameRampFamily) {
      confidence = "medium";
      warnings.push(
        `Filename suggests ${hint} but headers look like ${source}. Confirm bank source before importing.`
      );
    }
  }

  // Always run the parser, even if it returns zero rows.
  let rows;
  switch (source) {
    case "brex_primary":
    case "brex_treasury":
    case "brex_stripe_clearing":
    case "ramp_checking":
    case "ramp_treasury":
      // Ramp exports share Brex-style columns (Date, Merchant/Description, Amount, Balance).
      rows = parseBrexCsv(text, source);
      break;
    case "svb_money_market":
      rows = parseSvbMoneyMarketCsv(text);
      break;
    case "svb_checking":
      rows = parseSvbCheckingCsv(text);
      break;
    case "stripe":
      rows = parseStripeCsv(text);
      break;
  }

  if (!rows.length) {
    confidence = "low";
    warnings.push(
      `Detected ${source} but parsed 0 transactions. The file may have an unexpected layout — try the source dropdown to override.`
    );
  }

  return { source, confidence, rows, warnings };
};
