// Bank source auto-detector. Identifies files by CONTENT (header signature +
// first data-row account value), not filename. Filename is consulted only as a
// last-resort tiebreaker when the content provides no signal.
//
// Signature → source rules:
//   • Brex CSV:    header has "To/From" + "Account Number Last Four".
//                  First data row's last-four → 8083 brex_primary,
//                  2515 brex_treasury, 9173 brex_stripe_clearing.
//   • SVB BAI:     header has "Bank ID","Account Number","Account Title","BAI Type Code".
//                  First data row's account number → ends 4687 svb_checking,
//                  ends 0999 svb_collateral.
//   • SVB sweep:   header has "Sweep Account" + "Sweep Product" → svb_money_market.
//   • Ramp:        header has "Signed Transaction Amount" +
//                  "Detailed Transaction Type" → ramp_checking.
//
// Confidence:
//   • "high"  — header signature matched AND account value resolved.
//   • "medium"— header signature matched, account value ambiguous (used filename).
//   • "low"   — no content signal at all (filename-only or nothing).
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

// -------------------- filename fallback (last resort) --------------------
const filenameHint = (filename: string): BankSource | null => {
  const f = filename.toLowerCase();
  if (f.includes("ramp") && f.includes("treasury")) return "ramp_treasury";
  if (f.includes("ramp")) return "ramp_checking";
  if (f.includes("collateral")) return "svb_collateral";
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

// -------------------- header signature helpers --------------------
type Sig =
  | "brex"
  | "svb_bai"
  | "svb_sweep"
  | "ramp"
  | "generic_credit_debit"
  | "generic_desc_amt_bal"
  | "generic_desc_amt"
  | null;

interface HeaderInfo {
  lineIdx: number;
  raw: string;
  cols: string[]; // normalized
  rawCols: string[]; // original (untrimmed-normalized)
  sig: Sig;
}

const hasAll = (cols: string[], tokens: string[]) =>
  tokens.every((t) => cols.includes(t));
const hasAny = (cols: string[], tokens: string[]) =>
  tokens.some((t) => cols.includes(t));

const classifyHeader = (cols: string[]): Sig => {
  // Brex: "To/From" + "Account Number Last Four"
  if (hasAll(cols, ["tofrom"]) && hasAny(cols, ["accountnumberlastfour", "accountlastfour", "last4"])) {
    return "brex";
  }
  // SVB BAI: Bank ID + Account Number + Account Title + BAI Type Code
  if (
    hasAll(cols, ["bankid", "accountnumber", "accounttitle"]) &&
    hasAny(cols, ["baitypecode", "baicode", "baitype"])
  ) {
    return "svb_bai";
  }
  // SVB Money Market Sweep: Sweep Account + Sweep Product
  if (hasAll(cols, ["sweepaccount", "sweepproduct"])) return "svb_sweep";
  // Ramp: Signed Transaction Amount + Detailed Transaction Type
  if (hasAll(cols, ["signedtransactionamount", "detailedtransactiontype"])) return "ramp";
  // Generic shapes (used by Stripe / legacy SVB checking CSVs).
  const dateLike = hasAny(cols, ["date", "postingdate", "postedat", "transactiondate", "createdutc", "created"]);
  const descLike = hasAny(cols, ["description", "memo", "details", "merchant", "payee", "counterparty"]);
  const amtLike = hasAny(cols, ["amount", "amountusd", "transactionamount", "net", "gross"]);
  const creditLike = hasAny(cols, ["credit", "credits", "deposit", "deposits"]);
  const debitLike = hasAny(cols, ["debit", "debits", "withdrawal", "withdrawals"]);
  const balLike = hasAny(cols, ["balance", "runningbalance", "endingbalance"]);
  if (dateLike && descLike && creditLike && debitLike) return "generic_credit_debit";
  if (dateLike && descLike && amtLike && balLike) return "generic_desc_amt_bal";
  if (dateLike && descLike && amtLike) return "generic_desc_amt";
  return null;
};

const findHeader = (text: string): HeaderInfo | null => {
  const lines = text.split("\n");
  // Scan more lines than before — SVB BAI files prepend several metadata rows.
  const limit = Math.min(lines.length, 40);
  let best: HeaderInfo | null = null;
  let bestPriority = -1;
  // Priority ordering: bank-specific signatures beat generic shapes.
  const prio: Record<Exclude<Sig, null>, number> = {
    brex: 5,
    svb_bai: 5,
    svb_sweep: 5,
    ramp: 5,
    generic_credit_debit: 3,
    generic_desc_amt_bal: 2,
    generic_desc_amt: 1,
  };
  for (let i = 0; i < limit; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const rawCols = splitCsvLine(raw);
    const cols = rawCols.map(norm);
    const sig = classifyHeader(cols);
    if (!sig) continue;
    const p = prio[sig];
    if (p > bestPriority) {
      best = { lineIdx: i, raw, cols, rawCols, sig };
      bestPriority = p;
      if (p === 5) break; // best possible — stop early
    }
  }
  return best;
};

// First non-empty data row after the header.
const firstDataRow = (text: string, headerIdx: number): string[] | null => {
  const lines = text.split("\n");
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cols = splitCsvLine(raw);
    if (cols.every((c) => !c)) continue;
    return cols;
  }
  return null;
};

// Column lookup by any of a set of normalized header tokens.
const valueByToken = (
  headerCols: string[],
  row: string[],
  tokens: string[]
): string | null => {
  for (let i = 0; i < headerCols.length; i++) {
    if (tokens.includes(headerCols[i])) {
      return (row[i] ?? "").trim();
    }
  }
  return null;
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

// -------------------- account → source maps --------------------
const BREX_LAST4: Record<string, BankSource> = {
  "8083": "brex_primary",
  "2515": "brex_treasury",
  "9173": "brex_stripe_clearing",
};

const resolveSvbBai = (accountNumber: string): BankSource | null => {
  const d = onlyDigits(accountNumber);
  if (!d) return null;
  if (d.endsWith("4687")) return "svb_checking";
  if (d.endsWith("0999")) return "svb_collateral";
  return null;
};

// -------------------- main entry --------------------
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
        hint
          ? `No recognizable header found; falling back to filename hint (${hint}).`
          : "Could not find a recognizable header row. Re-export from your bank or remove extra summary rows at the top of the file.",
      ],
    };
  }

  let source: BankSource | null = null;
  let confidence: "high" | "medium" | "low" = "low";
  let signalUsed = "";

  const dataRow = firstDataRow(text, header.lineIdx);

  switch (header.sig) {
    case "brex": {
      const last4Raw = dataRow
        ? valueByToken(header.cols, dataRow, ["accountnumberlastfour", "accountlastfour", "last4"])
        : null;
      const last4 = last4Raw ? onlyDigits(last4Raw).slice(-4) : "";
      const mapped = last4 ? BREX_LAST4[last4] : undefined;
      if (mapped) {
        source = mapped;
        confidence = "high";
        signalUsed = `Brex header + Account Number Last Four = ${last4}`;
      } else {
        source = hint && hint.startsWith("brex_") ? hint : "brex_primary";
        confidence = "medium";
        signalUsed = `Brex header (no/unknown last-four "${last4Raw ?? ""}") — used filename hint`;
      }
      break;
    }
    case "svb_bai": {
      const acctRaw = dataRow
        ? valueByToken(header.cols, dataRow, ["accountnumber"])
        : null;
      const mapped = acctRaw ? resolveSvbBai(acctRaw) : null;
      if (mapped) {
        source = mapped;
        confidence = "high";
        signalUsed = `SVB BAI header + Account Number ending ${onlyDigits(acctRaw!).slice(-4)}`;
      } else {
        source = hint === "svb_collateral" ? "svb_collateral" : "svb_checking";
        confidence = "medium";
        signalUsed = `SVB BAI header (unknown account "${acctRaw ?? ""}") — used filename hint`;
      }
      break;
    }
    case "svb_sweep": {
      source = "svb_money_market";
      confidence = "high";
      signalUsed = "SVB sweep header (Sweep Account + Sweep Product)";
      break;
    }
    case "ramp": {
      source = "ramp_checking";
      confidence = "high";
      signalUsed = "Ramp header (Signed Transaction Amount + Detailed Transaction Type)";
      // Filename can refine to ramp_treasury if explicitly named.
      if (hint === "ramp_treasury") {
        source = "ramp_treasury";
        signalUsed += " + filename hint (treasury)";
      }
      break;
    }
    case "generic_credit_debit": {
      source = "svb_money_market";
      confidence = hint ? "medium" : "low";
      signalUsed = "Generic Credit/Debit header (no bank signature)";
      break;
    }
    case "generic_desc_amt_bal": {
      // Ambiguous: SVB Checking vs Stripe (with Balance). Lean on filename.
      if (hint === "stripe") {
        source = "stripe";
      } else {
        source = "svb_checking";
      }
      confidence = "medium";
      signalUsed = "Generic Date/Description/Amount/Balance — used filename hint";
      break;
    }
    case "generic_desc_amt": {
      source = hint ?? "stripe";
      confidence = "low";
      signalUsed = "Generic Date/Description/Amount — used filename fallback";
      break;
    }
    default:
      source = hint ?? "brex_primary";
      confidence = "low";
      signalUsed = "No bank signature recognised in header";
  }

  warnings.push(`Detected ${source} via: ${signalUsed}.`);
  if (hint && hint !== source) {
    const sameFamily =
      (hint.startsWith("brex_") && source!.startsWith("brex_")) ||
      (hint.startsWith("ramp_") && source!.startsWith("ramp_")) ||
      (hint.startsWith("svb_") && source!.startsWith("svb_"));
    if (!sameFamily) {
      if (confidence === "high") confidence = "medium";
      warnings.push(
        `Filename suggests ${hint} but content looks like ${source}. Confirm bank source before importing.`
      );
    }
  }

  // ---- parse ----
  let rows;
  switch (source) {
    case "brex_primary":
    case "brex_treasury":
    case "brex_stripe_clearing":
    case "ramp_checking":
    case "ramp_treasury":
      rows = parseBrexCsv(text, source);
      break;
    case "svb_money_market":
      rows = parseSvbMoneyMarketCsv(text);
      break;
    case "svb_checking":
    case "svb_collateral":
      // BAI/checking files share the row shape from svbChecking's perspective.
      rows = parseSvbCheckingCsv(text, source);
      break;
    case "stripe":
      rows = parseStripeCsv(text);
      break;
    case "brex_card":
      rows = [];
      break;
  }

  if (!rows!.length) {
    confidence = "low";
    warnings.push(
      `Detected ${source} but parsed 0 transactions. The file may have an unexpected layout — try the source dropdown to override.`
    );
  }

  return { source: source!, confidence, rows: rows!, warnings };
};
