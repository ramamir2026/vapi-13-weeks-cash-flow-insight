// Bank source auto-detector. Inspects header row + filename hints, returns
// the best-guess source with a confidence score and the parsed rows.
import { parseBrexCsv } from "./brex";
import { parseStripeCsv } from "./stripe";
import { parseSvbCheckingCsv } from "./svbChecking";
import { parseSvbMoneyMarketCsv } from "./svbMoneyMarket";
import { BankSource, DetectionResult, norm, splitCsvLine } from "./types";

const filenameHint = (filename: string): BankSource | null => {
  const f = filename.toLowerCase();
  if (f.includes("treasury")) return "brex_treasury";
  if (f.includes("stripe_clearing") || f.includes("stripe-clearing") || f.includes("clearing")) return "brex_stripe_clearing";
  if (f.includes("brex") && f.includes("primary")) return "brex_primary";
  if (f.includes("brex")) return "brex_primary";
  if (f.includes("money_market") || f.includes("moneymarket") || f.includes("sweep") || f.includes("mm")) return "svb_money_market";
  if (f.includes("svb")) return "svb_checking";
  if (f.includes("stripe")) return "stripe";
  return null;
};

const headerCols = (text: string): string[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = splitCsvLine(lines[i]).map(norm);
    if (cols.includes("date") || cols.includes("postingdate")) return cols;
  }
  return [];
};

export const detectAndParse = (text: string, filename: string): DetectionResult => {
  const cols = headerCols(text);
  const hint = filenameHint(filename);
  const warnings: string[] = [];

  // SVB Money Market: distinguishing marker is separate Credit/Debit columns.
  const hasCreditDebit = cols.includes("credit") && cols.includes("debit");
  // Brex: distinguishing markers are 'tofrom' or 'accountnumberlastfour'.
  const hasBrexMarkers = cols.includes("tofrom") || cols.includes("accountnumberlastfour") || cols.includes("accountlastfour");

  // Try each parser, prefer one that yields rows AND matches hint.
  const candidates: Array<{ source: BankSource; rows: ReturnType<typeof parseStripeCsv> }> = [];

  if (hasCreditDebit) {
    candidates.push({ source: "svb_money_market", rows: parseSvbMoneyMarketCsv(text) });
  } else if (hasBrexMarkers) {
    const src: BankSource = hint && hint.startsWith("brex_") ? hint : "brex_primary";
    candidates.push({ source: src, rows: parseBrexCsv(text, src) });
  } else if (cols.includes("description") && cols.includes("amount") && cols.includes("balance")) {
    // Ambiguous between SVB Checking and Stripe — both match this header shape.
    if (hint === "stripe") {
      candidates.push({ source: "stripe", rows: parseStripeCsv(text) });
    } else {
      candidates.push({ source: "svb_checking", rows: parseSvbCheckingCsv(text) });
    }
  } else if (cols.includes("date") && cols.includes("amount")) {
    candidates.push({ source: "stripe", rows: parseStripeCsv(text) });
  }

  const best = candidates.find((c) => c.rows.length > 0) ?? candidates[0];
  if (!best || best.rows.length === 0) {
    return {
      source: hint ?? "brex_primary",
      confidence: "low",
      rows: [],
      warnings: ["Could not detect bank source from header row. Try renaming the file with a hint (brex/svb/stripe/treasury/mm) or re-export from your bank."],
    };
  }

  let confidence: "high" | "medium" | "low" = "high";
  if (hint && hint !== best.source) {
    confidence = "medium";
    warnings.push(`Filename suggests ${hint}, but headers look like ${best.source}. Confirm before importing.`);
  }
  if (best.source === "svb_checking" && cols.includes("description") && cols.includes("balance") && !filenameHint(filename)) {
    confidence = "medium";
    warnings.push("Headers match both SVB Checking and Stripe formats — confirm bank source.");
  }

  return { source: best.source, confidence, rows: best.rows, warnings };
};
