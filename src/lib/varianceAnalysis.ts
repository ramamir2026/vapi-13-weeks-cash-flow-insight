// Pure helpers for computing modeled vs actual variance from
// model_weeks snapshots and weekly_actuals rows.

import type { ModelWeekRow, WeeklyActualRow } from "@/hooks/useVariance";

export type LineKey =
  | "stripeRevenue"
  | "enterpriseRevenue"
  | "arCollections"
  | "payroll"
  | "brexCard"
  | "rent"
  | "cogs_cogs_anthropic"
  | "cogs_cogs_azure"
  | "cogs_cogs_openai"
  | "cogs_cogs_elevenlabs"
  | "cogs_cogs_deepgram"
  | "cogs_cogs_pump_aws"
  | "cogs_cogs_twilio"
  | "cogs_cogs_other"
  | "opex_opex_sm"
  | "opex_opex_software"
  | "opex_opex_legal"
  | "opex_opex_deel"
  | "opex_opex_hr_te"
  | "opex_opex_recruiting"
  | "opex_opex_ga";

export interface LineDef {
  key: LineKey;
  label: string;
  group: "Inflow" | "Payroll" | "COGS" | "Card" | "OpEx" | "Rent";
  /** Pull modeled value from a model_weeks row. */
  modeled: (m: ModelWeekRow) => number;
  /** Sign convention for variance interpretation: +1 = higher is better (inflows), -1 = higher is worse (costs). */
  sign: 1 | -1;
}

export const LINE_DEFS: LineDef[] = [
  { key: "stripeRevenue", label: "Stripe Revenue", group: "Inflow", modeled: (m) => m.stripe_revenue, sign: 1 },
  { key: "enterpriseRevenue", label: "Enterprise ACH", group: "Inflow", modeled: (m) => m.enterprise_revenue, sign: 1 },
  { key: "arCollections", label: "A/R Collections", group: "Inflow", modeled: (m) => m.ar_collections, sign: 1 },
  { key: "payroll", label: "Payroll", group: "Payroll", modeled: (m) => m.payroll, sign: -1 },
  // COGS lines — only the rolled-up `cogs` column exists on model_weeks; per-vendor modeled values are
  // not stored, so we leave modeled = 0 for individual vendors and instead show a single "COGS Total" row.
  { key: "cogs_cogs_anthropic", label: "COGS · Anthropic", group: "COGS", modeled: () => 0, sign: -1 },
  { key: "cogs_cogs_azure", label: "COGS · Azure", group: "COGS", modeled: () => 0, sign: -1 },
  { key: "cogs_cogs_openai", label: "COGS · OpenAI", group: "COGS", modeled: () => 0, sign: -1 },
  { key: "cogs_cogs_elevenlabs", label: "COGS · ElevenLabs", group: "COGS", modeled: () => 0, sign: -1 },
  { key: "cogs_cogs_deepgram", label: "COGS · Deepgram", group: "COGS", modeled: () => 0, sign: -1 },
  { key: "cogs_cogs_pump_aws", label: "COGS · Pump/AWS", group: "COGS", modeled: () => 0, sign: -1 },
  { key: "cogs_cogs_twilio", label: "COGS · Twilio", group: "COGS", modeled: () => 0, sign: -1 },
  { key: "cogs_cogs_other", label: "COGS · Other", group: "COGS", modeled: () => 0, sign: -1 },
  { key: "brexCard", label: "Brex Card Payment", group: "Card", modeled: (m) => m.card_payments, sign: -1 },
  { key: "opex_opex_sm", label: "OpEx · S&M", group: "OpEx", modeled: () => 0, sign: -1 },
  { key: "opex_opex_software", label: "OpEx · Software", group: "OpEx", modeled: () => 0, sign: -1 },
  { key: "opex_opex_legal", label: "OpEx · Legal", group: "OpEx", modeled: () => 0, sign: -1 },
  { key: "opex_opex_deel", label: "OpEx · Deel", group: "OpEx", modeled: () => 0, sign: -1 },
  { key: "opex_opex_hr_te", label: "OpEx · HR/T&E", group: "OpEx", modeled: () => 0, sign: -1 },
  { key: "opex_opex_recruiting", label: "OpEx · Recruiting", group: "OpEx", modeled: () => 0, sign: -1 },
  { key: "opex_opex_ga", label: "OpEx · G&A", group: "OpEx", modeled: () => 0, sign: -1 },
  { key: "rent", label: "Rent", group: "Rent", modeled: (m) => m.rent, sign: -1 },
];

export type StatusBand = "on_track" | "watch" | "off_track";

export const statusFromPct = (pct: number): StatusBand => {
  const a = Math.abs(pct);
  if (a <= 5) return "on_track";
  if (a <= 15) return "watch";
  return "off_track";
};

export const computeVariance = (modeled: number, actual: number) => {
  const delta = actual - modeled;
  const pct = modeled === 0 ? (actual === 0 ? 0 : 100) : (delta / Math.abs(modeled)) * 100;
  return { delta, pct };
};

const WEEKS_PER_MONTH = 4.333;

export interface JoinedLine {
  key: LineKey | "cogsTotal" | "opexTotal";
  label: string;
  group: string;
  modeled: number;
  actual: number;
  delta: number;
  pct: number;
}

export interface JoinedWeek {
  weekStart: string; // ISO yyyy-mm-dd (monday)
  modeledClosing: number;
  actualClosing: number;
  modeledBurn: number;
  actualBurn: number;
  modeledInflows: number;
  modeledOutflows: number;
  actualInflows: number;
  actualOutflows: number;
  modeledOpening: number;
  /** runway months estimate (using the week's burn extrapolated to monthly). */
  actualRunwayMonths: number | null;
  modeledRunwayMonths: number | null;
  lines: JoinedLine[];
}

const sumModeledOutflows = (m: ModelWeekRow) =>
  Number(m.payroll) + Number(m.cogs) + Number(m.card_payments) + Number(m.opex) + Number(m.rent);
const sumModeledInflows = (m: ModelWeekRow) =>
  Number(m.stripe_revenue) + Number(m.enterprise_revenue) + Number(m.ar_collections);

const sumActualByPrefix = (map: Record<string, number>, prefix: string) =>
  Object.keys(map)
    .filter((k) => k.startsWith(prefix))
    .reduce((s, k) => s + (Number(map[k]) || 0), 0);

const computeActualBurn = (a: WeeklyActualRow): number => {
  const inflows =
    (a.lineMap.stripeRevenue ?? 0) +
    (a.lineMap.enterpriseRevenue ?? 0) +
    (a.lineMap.arCollections ?? 0);
  const outflows =
    (a.lineMap.payroll ?? 0) +
    sumActualByPrefix(a.lineMap, "cogs_") +
    (a.lineMap.brexCard ?? 0) +
    sumActualByPrefix(a.lineMap, "opex_") +
    (a.lineMap.rent ?? 0);
  return outflows - inflows;
};

/** Join model_weeks (one snapshot) with weekly_actuals on week_start_date. Only weeks with both sides. */
export const joinWeeks = (model: ModelWeekRow[], actuals: WeeklyActualRow[]): JoinedWeek[] => {
  const actualByWeek = new Map<string, WeeklyActualRow>();
  for (const a of actuals) {
    // "completed" = some actual was entered (either closing balance or any line item)
    const hasAny = (a.closing_cash_balance && a.closing_cash_balance !== 0) || Object.keys(a.lineMap).length > 0;
    if (hasAny) actualByWeek.set(a.week_start_date, a);
  }

  const out: JoinedWeek[] = [];
  for (const m of model) {
    const a = actualByWeek.get(m.week_start_date);
    if (!a) continue;

    const modeledBurn = sumModeledOutflows(m) - sumModeledInflows(m);
    const actualBurn = computeActualBurn(a);

    const modeledClosing = Number(m.closing_balance);
    const actualClosing = a.closing_cash_balance || a.lineMap.closingBalance || 0;

    const lines: JoinedLine[] = [];
    for (const def of LINE_DEFS) {
      const modeled = def.modeled(m);
      const actual = a.lineMap[def.key] ?? 0;
      // Skip rows that are zero on both sides — keeps drill-down readable.
      if (modeled === 0 && actual === 0) continue;
      const { delta, pct } = computeVariance(modeled, actual);
      lines.push({
        key: def.key,
        label: def.label,
        group: def.group,
        modeled,
        actual,
        delta,
        pct,
      });
    }
    // Derived rollups for groups whose modeled lives only at total level.
    const cogsActual = sumActualByPrefix(a.lineMap, "cogs_");
    if (Number(m.cogs) || cogsActual) {
      const { delta, pct } = computeVariance(Number(m.cogs), cogsActual);
      lines.push({
        key: "cogsTotal",
        label: "COGS · Total",
        group: "COGS",
        modeled: Number(m.cogs),
        actual: cogsActual,
        delta,
        pct,
      });
    }
    const opexActual = sumActualByPrefix(a.lineMap, "opex_");
    if (Number(m.opex) || opexActual) {
      const { delta, pct } = computeVariance(Number(m.opex), opexActual);
      lines.push({
        key: "opexTotal",
        label: "OpEx · Total",
        group: "OpEx",
        modeled: Number(m.opex),
        actual: opexActual,
        delta,
        pct,
      });
    }

    const modeledMonthlyBurn = modeledBurn * WEEKS_PER_MONTH;
    const actualMonthlyBurn = actualBurn * WEEKS_PER_MONTH;
    const modeledRunwayMonths = modeledMonthlyBurn > 0 ? modeledClosing / modeledMonthlyBurn : null;
    const actualRunwayMonths = actualMonthlyBurn > 0 ? actualClosing / actualMonthlyBurn : null;

    out.push({
      weekStart: m.week_start_date,
      modeledClosing,
      actualClosing,
      modeledBurn,
      actualBurn,
      modeledOpening: Number(m.opening_balance),
      actualRunwayMonths,
      modeledRunwayMonths,
      lines,
    });
  }
  return out;
};

export interface VarianceDriver {
  key: string;
  label: string;
  cumulativeAbsPct: number;
  averagePct: number; // signed
}

export const topVarianceDrivers = (joined: JoinedWeek[], n = 3): VarianceDriver[] => {
  const acc = new Map<string, { label: string; sumAbs: number; sumSigned: number; count: number }>();
  for (const w of joined) {
    for (const l of w.lines) {
      // Skip the rollups so we surface specific lines.
      if (l.key === "cogsTotal" || l.key === "opexTotal") continue;
      const cur = acc.get(l.key) ?? { label: l.label, sumAbs: 0, sumSigned: 0, count: 0 };
      cur.sumAbs += Math.abs(l.pct);
      cur.sumSigned += l.pct;
      cur.count += 1;
      acc.set(l.key, cur);
    }
  }
  return Array.from(acc.entries())
    .map(([key, v]) => ({
      key,
      label: v.label,
      cumulativeAbsPct: v.sumAbs,
      averagePct: v.count > 0 ? v.sumSigned / v.count : 0,
    }))
    .sort((a, b) => b.cumulativeAbsPct - a.cumulativeAbsPct)
    .slice(0, n);
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export interface HireForInsight {
  name: string;
  start_date: string;
}

export const generateInsights = (joined: JoinedWeek[], hires: HireForInsight[] = []): string[] => {
  if (joined.length < 2) return [];
  const insights: string[] = [];

  // 1) A/R drag — actual <model for ≥3 consecutive most-recent weeks
  const arSeries = joined.map((w) => w.lines.find((l) => l.key === "arCollections"));
  let trailingBelow = 0;
  let trailingPct = 0;
  for (let i = arSeries.length - 1; i >= 0; i--) {
    const l = arSeries[i];
    if (l && l.modeled > 0 && l.actual < l.modeled) {
      trailingBelow += 1;
      trailingPct += Math.abs(l.pct);
    } else {
      break;
    }
  }
  if (trailingBelow >= 3) {
    const avgPct = trailingPct / trailingBelow;
    insights.push(
      `A/R collections have come in ${avgPct.toFixed(0)}% below model for ${trailingBelow} consecutive weeks — consider revising collection timing assumptions.`
    );
  }

  // 2) Burn pressure
  const avgModeledBurn = joined.reduce((s, w) => s + w.modeledBurn, 0) / joined.length;
  const avgActualBurn = joined.reduce((s, w) => s + w.actualBurn, 0) / joined.length;
  const burnDelta = avgActualBurn - avgModeledBurn;
  if (burnDelta > 5_000) {
    const drivers = topVarianceDrivers(joined, 1);
    const driverLabel = drivers[0]?.label ?? "an unidentified line";
    insights.push(
      `Actual burn rate is tracking ${fmtMoney(burnDelta)} above model — driven primarily by ${driverLabel}.`
    );
  } else if (burnDelta < -5_000) {
    insights.push(
      `Actual burn rate is tracking ${fmtMoney(Math.abs(burnDelta))} below model — burn is contained relative to forecast.`
    );
  }

  // 3) Payroll over
  const payrollLines = joined
    .map((w) => w.lines.find((l) => l.key === "payroll"))
    .filter((l): l is NonNullable<typeof l> => !!l && l.modeled > 0);
  if (payrollLines.length > 0) {
    const avgPct = payrollLines.reduce((s, l) => s + l.pct, 0) / payrollLines.length;
    if (avgPct > 5) {
      const earliest = joined[0].weekStart;
      const latest = joined[joined.length - 1].weekStart;
      const recentHires = hires.filter((h) => h.start_date >= earliest && h.start_date <= latest);
      const hireBlurb = recentHires.length > 0
        ? `likely from ${recentHires.slice(0, 3).map((h) => h.name).join(", ")}${recentHires.length > 3 ? ` +${recentHires.length - 3} more` : ""}`
        : "potentially unbudgeted comp adjustments";
      insights.push(
        `Payroll is tracking ${avgPct.toFixed(0)}% above model — ${hireBlurb}.`
      );
    }
  }

  // 4) Runway compression — last 4 weeks
  const tail = joined.slice(-4).filter((w) => w.actualRunwayMonths != null);
  if (tail.length >= 2) {
    const first = tail[0].actualRunwayMonths!;
    const last = tail[tail.length - 1].actualRunwayMonths!;
    const drop = first - last;
    if (drop > 0.5) {
      insights.push(
        `Runway has contracted by ${drop.toFixed(1)} months over the last ${tail.length} weeks.`
      );
    }
  }

  return insights;
};
