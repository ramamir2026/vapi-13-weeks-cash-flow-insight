// MIRROR of src/lib/variance.ts (detectAlerts portion) — keep in sync.
import { isKnownCogsVendor, matchesAnyRule } from "./knownVendors.ts";

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertCandidate {
  category: string;
  assumption_key: string;
  modeled_amount: number;
  actual_amount: number;
  variance_pct: number;
  variance_dollar: number;
  severity: AlertSeverity;
  title: string;
  detail: string;
  suggested_value?: number;
}

const PCT_TRIGGER = 0.1;
const DOLLAR_TRIGGER = 5_000;

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const classify = (modeled: number, actual: number): AlertSeverity | null => {
  const dollar = Math.abs(actual - modeled);
  const pct = modeled === 0 ? (actual === 0 ? 0 : 1) : dollar / Math.abs(modeled);
  if (pct <= PCT_TRIGGER || dollar < DOLLAR_TRIGGER) return null;
  if (pct > 0.5 || dollar > 100_000) return "critical";
  if (pct > 0.2 || dollar > 10_000) return "warning";
  return "info";
};

const buildBase = (
  category: string,
  assumption_key: string,
  modeled: number,
  actual: number,
  severity: AlertSeverity,
): Omit<AlertCandidate, "title" | "detail"> => ({
  category,
  assumption_key,
  modeled_amount: modeled,
  actual_amount: actual,
  variance_pct:
    modeled === 0 ? (actual === 0 ? 0 : 100) : ((actual - modeled) / Math.abs(modeled)) * 100,
  variance_dollar: actual - modeled,
  severity,
});

export interface VarianceTxn {
  date: string;
  vendor: string;
  amount: number;
  category: string;
  bank_source: string;
}

export interface VarianceInput {
  weekStartDate: string;
  assumptions: Record<string, number>;
  txns: VarianceTxn[];
  bankCategoryRules: { vendor_contains: string }[];
  modeledAr?: number;
  modeledOpeningBalance?: number;
  verifiedOpeningBalance?: number;
  partialMonthBrexActual?: number;
  brexMonthlyEstimate?: number;
  daysIntoMonth?: number;
  daysInMonth?: number;
  trailingBurnPriorWeek?: number;
  trailingBurnThisWeek?: number;
  pumpAwsActualThisMonth?: number;
  pumpAwsActualLastMonth?: number;
}

const checkPayroll = (input: VarianceInput): AlertCandidate | null => {
  const modeled = input.assumptions["payroll_semi_monthly"] ?? 0;
  if (modeled <= 0) return null;
  const actual = input.txns
    .filter((t) => /sequoia\s*one/i.test(t.vendor))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  if (actual <= modeled * 1.05) return null;
  const dollar = actual - modeled;
  const pct = dollar / modeled;
  const severity: AlertSeverity =
    pct > 0.5 || dollar > 100_000 ? "critical" : pct > 0.2 || dollar > 10_000 ? "warning" : "info";
  return {
    ...buildBase("payroll", "payroll_semi_monthly", modeled, actual, severity),
    title: `Payroll ${(pct * 100).toFixed(0)}% above assumption`,
    detail: `Actual ${fmtMoney(actual)} vs model ${fmtMoney(modeled)} — difference ${fmtMoney(dollar)}.`,
    suggested_value: actual,
  };
};

const checkRecruiting = (input: VarianceInput): AlertCandidate | null => {
  const modeled = input.assumptions["opex_recruiting"] ?? 0;
  const actual = input.txns
    .filter(
      (t) =>
        t.category === "recruiting" ||
        (t.category === "opex" && /recruit|hire|talent/i.test(t.vendor)),
    )
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  if (actual === 0) return null;
  const severity = classify(modeled, actual);
  if (!severity) return null;
  return {
    ...buildBase("recruiting", "opex_recruiting", modeled, actual, severity),
    title: `Recruiting ${actual > modeled ? "above" : "below"} assumption`,
    detail: `Actual ${fmtMoney(actual)} vs model ${fmtMoney(modeled)}.`,
    suggested_value: actual,
  };
};

const COGS_KEY_TO_PATTERN: Record<string, RegExp> = {
  cogs_anthropic: /anthropic/i,
  cogs_azure: /azure|microsoft/i,
  cogs_openai: /openai/i,
  cogs_elevenlabs: /elevenlabs|eleven\s*labs/i,
  cogs_deepgram: /deepgram/i,
  cogs_pump_aws: /pump|aws|amazon\s*web/i,
  cogs_twilio: /twilio/i,
};

const checkCogsVendors = (input: VarianceInput): AlertCandidate[] => {
  const out: AlertCandidate[] = [];
  for (const [key, pattern] of Object.entries(COGS_KEY_TO_PATTERN)) {
    const modeled = input.assumptions[key] ?? 0;
    const actual = input.txns
      .filter((t) => pattern.test(t.vendor))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    if (actual === 0 && modeled === 0) continue;
    const severity = classify(modeled, actual);
    if (!severity) continue;
    const label = key.replace("cogs_", "").replace("_", "/");
    out.push({
      ...buildBase("cogs", key, modeled, actual, severity),
      title: `${label} ${actual > modeled ? "above" : "below"} assumption`,
      detail: `Actual ${fmtMoney(actual)} vs model ${fmtMoney(modeled)} — difference ${fmtMoney(actual - modeled)}.`,
      suggested_value: actual,
    });
  }
  return out;
};

const checkArCollections = (input: VarianceInput): AlertCandidate | null => {
  const modeled = input.modeledAr ?? 0;
  if (modeled <= 0) return null;
  const actual = input.txns
    .filter((t) => t.category === "ar_collections" || t.category === "enterprise_revenue")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  if (actual >= modeled * 0.8) return null;
  const dollar = modeled - actual;
  if (dollar < DOLLAR_TRIGGER) return null;
  const pct = dollar / modeled;
  const severity: AlertSeverity = pct > 0.5 ? "critical" : pct > 0.35 ? "warning" : "info";
  return {
    ...buildBase("ar_collections", "ar_collections_weekly", modeled, actual, severity),
    title: `A/R collections ${(pct * 100).toFixed(0)}% below model`,
    detail: `Collected ${fmtMoney(actual)} vs ${fmtMoney(modeled)} expected.`,
  };
};

const checkOneTimePayments = (input: VarianceInput): AlertCandidate[] => {
  const out: AlertCandidate[] = [];
  for (const t of input.txns) {
    const amount = Math.abs(t.amount);
    if (amount <= 100_000) continue;
    if (isKnownCogsVendor(t.vendor)) continue;
    if (matchesAnyRule(t.vendor, input.bankCategoryRules)) continue;
    out.push({
      category: "one_time",
      assumption_key: `one_time_${t.date}_${t.vendor.slice(0, 24)}`,
      modeled_amount: 0,
      actual_amount: amount,
      variance_pct: 100,
      variance_dollar: amount,
      severity: "critical",
      title: `Unplanned ${fmtMoney(amount)} payment to ${t.vendor.slice(0, 40)}`,
      detail: `${t.date} · No matching model row, category rule, or known COGS vendor.`,
    });
  }
  return out;
};

export const detectAlerts = (input: VarianceInput): AlertCandidate[] => {
  const out: AlertCandidate[] = [];
  const push = (c: AlertCandidate | null) => {
    if (c) out.push(c);
  };
  push(checkPayroll(input));
  push(checkRecruiting(input));
  out.push(...checkCogsVendors(input));
  push(checkArCollections(input));
  out.push(...checkOneTimePayments(input));
  return out;
};
