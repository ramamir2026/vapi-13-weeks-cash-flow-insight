// Variance detection engine — compares actual bank transactions against
// model assumptions and produces alert candidates.
//
// Trigger condition: variance >10% AND ≥$5,000 (both must be true)
// Severity bands (after trigger):
//   info     — 10–20% AND $5K–$10K
//   warning  — 20–50% OR $10K–$100K
//   critical — >50% OR >$100K

import { isKnownCogsVendor, matchesAnyRule } from "./knownVendors";

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

const PCT_TRIGGER = 0.1; // >10%
const DOLLAR_TRIGGER = 5_000; // ≥$5,000

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Returns severity if the variance trips the gate, else null. */
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
  severity: AlertSeverity
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

// ============ Inputs ============
export interface VarianceTxn {
  date: string;
  vendor: string;
  amount: number;
  category: string;
  bank_source: string;
}

export interface VarianceInput {
  weekStartDate: string; // ISO yyyy-mm-dd
  assumptions: Record<string, number>;
  txns: VarianceTxn[];
  bankCategoryRules: { vendor_contains: string }[];
  // Optional context for trend / Brex partial-month / opening-balance checks
  modeledAr?: number; // modeled A/R collections for the week
  modeledOpeningBalance?: number; // sum of cash assumptions
  verifiedOpeningBalance?: number; // sum of statement closing balances per source
  partialMonthBrexActual?: number; // actual Brex spend MTD
  brexMonthlyEstimate?: number; // sum of brex_w2/w7/w11 or proxy
  daysIntoMonth?: number;
  daysInMonth?: number;
  trailingBurnPriorWeek?: number;
  trailingBurnThisWeek?: number;
  pumpAwsActualThisMonth?: number;
  pumpAwsActualLastMonth?: number;
}

// ============ Specific checks ============

/** Payroll: Sequoia One ACH vs payroll_semi_monthly. Special threshold: >5% higher. */
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
  const base = buildBase("payroll", "payroll_semi_monthly", modeled, actual, severity);
  return {
    ...base,
    title: `Payroll ${(pct * 100).toFixed(0)}% above assumption`,
    detail: `Actual ${fmtMoney(actual)} vs model ${fmtMoney(modeled)} — difference ${fmtMoney(dollar)}. Possible cause: new hire or bonus.`,
    suggested_value: actual,
  };
};

/** Recruiting: sum of recruiting vendor actuals vs opex_recruiting. */
const checkRecruiting = (input: VarianceInput): AlertCandidate | null => {
  const modeled = input.assumptions["opex_recruiting"] ?? 0;
  const actual = input.txns
    .filter((t) => t.category === 'recruiting' ||
      (t.category === 'opex' && /recruit|hire|talent/i.test(t.vendor)))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  if (actual === 0) return null;
  const severity = classify(modeled, actual);
  if (!severity) return null;
  const base = buildBase("recruiting", "opex_recruiting", modeled, actual, severity);
  return {
    ...base,
    title: `Recruiting ${actual > modeled ? "above" : "below"} assumption`,
    detail: `Actual ${fmtMoney(actual)} vs model ${fmtMoney(modeled)} — recruiting has been running over historically.`,
    suggested_value: actual,
  };
};

/** COGS vendors: per-vendor actual vs assumption. */
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
    const base = buildBase("cogs", key, modeled, actual, severity);
    const label = key.replace("cogs_", "").replace("_", "/");
    out.push({
      ...base,
      title: `${label} ${actual > modeled ? "above" : "below"} assumption`,
      detail: `Actual ${fmtMoney(actual)} vs model ${fmtMoney(modeled)} — difference ${fmtMoney(actual - modeled)}.`,
      suggested_value: actual,
    });
  }
  return out;
};

/** Pump/AWS: flag if MoM growth > 15%. */
const checkPumpAwsMoM = (input: VarianceInput): AlertCandidate | null => {
  const last = input.pumpAwsActualLastMonth ?? 0;
  const now = input.pumpAwsActualThisMonth ?? 0;
  if (last <= 0 || now <= 0) return null;
  const growth = (now - last) / last;
  if (growth <= 0.15) return null;
  const severity: AlertSeverity = growth > 0.5 ? "critical" : "warning";
  const base = buildBase("cogs", "cogs_pump_aws", last, now, severity);
  return {
    ...base,
    title: `Pump/AWS up ${(growth * 100).toFixed(0)}% month over month`,
    detail: `${fmtMoney(now)} this month vs ${fmtMoney(last)} last month. Signals infrastructure cost acceleration.`,
    suggested_value: now,
  };
};

/** Brex card: partial-month run-rate >10% above estimate. */
const checkBrexPartialMonth = (input: VarianceInput): AlertCandidate | null => {
  const actual = input.partialMonthBrexActual ?? 0;
  const estimate = input.brexMonthlyEstimate ?? 0;
  const days = input.daysIntoMonth ?? 0;
  const total = input.daysInMonth ?? 30;
  if (actual <= 0 || estimate <= 0 || days <= 0) return null;
  const projected = (actual / days) * total;
  if (projected <= estimate * 1.1) return null;
  const dollar = projected - estimate;
  if (dollar < DOLLAR_TRIGGER) return null;
  const pct = dollar / estimate;
  const severity: AlertSeverity = pct > 0.5 ? "critical" : pct > 0.2 ? "warning" : "info";
  const base = buildBase("card_payments", "brex_w2", estimate, projected, severity);
  return {
    ...base,
    title: `Brex card tracking ${(pct * 100).toFixed(0)}% above estimate`,
    detail: `MTD ${fmtMoney(actual)} over ${days} days projects to ${fmtMoney(projected)} vs ${fmtMoney(estimate)} estimate.`,
  };
};

/** A/R collections: actual >20% below modeled. */
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
  const base = buildBase("ar_collections", "ar_collections_weekly", modeled, actual, severity);
  return {
    ...base,
    title: `A/R collections ${(pct * 100).toFixed(0)}% below model`,
    detail: `Collected ${fmtMoney(actual)} vs ${fmtMoney(modeled)} expected — potential payment delays.`,
  };
};

/** Opening balance: sum of 5 cash assumptions vs verified statement balances; >$10K drift. */
const checkOpeningBalance = (input: VarianceInput): AlertCandidate | null => {
  const modeled = input.modeledOpeningBalance ?? 0;
  const verified = input.verifiedOpeningBalance ?? 0;
  if (modeled <= 0 || verified <= 0) return null;
  const dollar = Math.abs(verified - modeled);
  if (dollar <= 10_000) return null;
  const severity: AlertSeverity = dollar > 100_000 ? "critical" : "warning";
  const base = buildBase("cash", "opening_cash_balance", modeled, verified, severity);
  return {
    ...base,
    title: `Opening balance off by ${fmtMoney(dollar)}`,
    detail: `Sum of 5 account assumptions ${fmtMoney(modeled)} vs verified statement balances ${fmtMoney(verified)}.`,
    suggested_value: verified,
  };
};

/** One-time payments: >$100K with vendor unknown to both rules and known COGS list. */
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

/** Burn rate: 4-week trailing burn week-over-week growth >15%. */
const checkBurnRate = (input: VarianceInput): AlertCandidate | null => {
  const prev = input.trailingBurnPriorWeek ?? 0;
  const now = input.trailingBurnThisWeek ?? 0;
  if (prev <= 0 || now <= 0) return null;
  const growth = (now - prev) / prev;
  if (growth <= 0.15) return null;
  const severity: AlertSeverity = growth > 0.4 ? "critical" : "warning";
  const base = buildBase("burn", "burn_rate", prev, now, severity);
  return {
    ...base,
    title: `Burn rate up ${(growth * 100).toFixed(0)}% week over week`,
    detail: `4-week trailing burn ${fmtMoney(now)} vs ${fmtMoney(prev)} prior week — signals cost acceleration.`,
  };
};

// ============ Public API ============

export const detectAlerts = (input: VarianceInput): AlertCandidate[] => {
  const out: AlertCandidate[] = [];
  const push = (c: AlertCandidate | null) => {
    if (c) out.push(c);
  };
  push(checkPayroll(input));
  push(checkRecruiting(input));
  out.push(...checkCogsVendors(input));
  push(checkPumpAwsMoM(input));
  push(checkBrexPartialMonth(input));
  push(checkArCollections(input));
  push(checkOpeningBalance(input));
  out.push(...checkOneTimePayments(input));
  push(checkBurnRate(input));
  return out;
};

// ============ Trend detector ============
export interface SnapshotRow {
  week_start_date: string;
  assumption_key: string;
  modeled: number;
  actual: number;
}

export interface TrendAlert {
  category: "trend_cost_up" | "trend_inflow_down" | "trend_runway";
  assumption_key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

const COST_KEYS = new Set([
  "opex_recruiting",
  "opex_software",
  "opex_legal",
  "opex_sm",
  "opex_ga",
  "cogs_anthropic",
  "cogs_azure",
  "cogs_openai",
  "cogs_pump_aws",
]);
const INFLOW_KEYS = new Set([
  "stripe_daily_rate",
  "enterprise_ach_weekly",
  "ar_collections_weekly",
]);

export const detectTrends = (snapshots: SnapshotRow[]): TrendAlert[] => {
  const byKey = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) {
    const list = byKey.get(s.assumption_key) ?? [];
    list.push(s);
    byKey.set(s.assumption_key, list);
  }
  const out: TrendAlert[] = [];
  for (const [key, rows] of byKey) {
    rows.sort((a, b) => a.week_start_date.localeCompare(b.week_start_date));
    const last = rows.slice(-4);
    if (COST_KEYS.has(key) && last.length >= 3) {
      const tail = last.slice(-3);
      const increasing = tail[0].actual < tail[1].actual && tail[1].actual < tail[2].actual;
      if (increasing) {
        const monthly = tail[2].actual * 4.333;
        const modeled = tail[2].modeled * 4.333;
        out.push({
          category: "trend_cost_up",
          assumption_key: key,
          severity: monthly > modeled * 1.4 ? "critical" : "warning",
          title: `${key} has increased 3 weeks in a row`,
          detail: `Now tracking ${fmtMoney(monthly)}/month vs ${fmtMoney(modeled)} assumption.`,
        });
      }
    }
    if (INFLOW_KEYS.has(key) && last.length >= 2) {
      const tail = last.slice(-2);
      const decreasing = tail[0].actual > tail[1].actual;
      if (decreasing) {
        out.push({
          category: "trend_inflow_down",
          assumption_key: key,
          severity: "warning",
          title: `${key} down 2 weeks in a row`,
          detail: `${fmtMoney(tail[1].actual)} vs ${fmtMoney(tail[0].actual)} prior week — monitor closely.`,
        });
      }
    }
  }
  return out;
};

// ============ Drift indicator ============
export type DriftLevel = "green" | "amber" | "red";

export const driftLevel = (modeled: number, actual: number): DriftLevel => {
  if (modeled === 0) return "green";
  const pct = Math.abs(actual - modeled) / Math.abs(modeled);
  if (pct < 0.05) return "green";
  if (pct < 0.2) return "amber";
  return "red";
};
