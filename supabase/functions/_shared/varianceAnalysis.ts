// MIRROR of src/lib/varianceAnalysis.ts — keep logic in sync.
// Edge functions can't import from src/, so this is duplicated.
// Note: ModelWeekRow / WeeklyActualRow types are inlined here (no @/hooks import in Deno).

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

export interface ModelWeekRow {
  week_start_date: string;
  opening_balance: number;
  stripe_revenue: number;
  enterprise_revenue: number;
  ar_collections: number;
  payroll: number;
  cogs: number;
  card_payments: number;
  rent: number;
  opex: number;
  net_change: number;
  closing_balance: number;
}

export interface WeeklyActualRow {
  week_start_date: string;
  closing_cash_balance: number;
  lineMap: Record<string, number>;
}

export interface LineDef {
  key: LineKey;
  label: string;
  group: "Inflow" | "Payroll" | "COGS" | "Card" | "OpEx" | "Rent";
  modeled: (m: ModelWeekRow) => number;
  sign: 1 | -1;
}

export const LINE_DEFS: LineDef[] = [
  { key: "stripeRevenue", label: "Stripe Revenue", group: "Inflow", modeled: (m) => m.stripe_revenue, sign: 1 },
  { key: "enterpriseRevenue", label: "Enterprise ACH", group: "Inflow", modeled: (m) => m.enterprise_revenue, sign: 1 },
  { key: "arCollections", label: "A/R Collections", group: "Inflow", modeled: (m) => m.ar_collections, sign: 1 },
  { key: "payroll", label: "Payroll", group: "Payroll", modeled: (m) => m.payroll, sign: -1 },
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

export interface CashFlowBreakdown {
  stripe: number;
  enterprise: number;
  ar: number;
  payroll: number;
  cogs: number;
  card: number;
  opex: number;
  rent: number;
}

export interface JoinedWeek {
  weekStart: string;
  modeledClosing: number;
  actualClosing: number;
  modeledBurn: number;
  actualBurn: number;
  modeledInflows: number;
  modeledOutflows: number;
  actualInflows: number;
  actualOutflows: number;
  modeledBreakdown: CashFlowBreakdown;
  actualBreakdown: CashFlowBreakdown;
  modeledOpening: number;
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

const computeActualInflows = (a: WeeklyActualRow): number =>
  (a.lineMap.stripeRevenue ?? 0) +
  (a.lineMap.enterpriseRevenue ?? 0) +
  (a.lineMap.arCollections ?? 0);

const computeActualOutflows = (a: WeeklyActualRow): number =>
  (a.lineMap.payroll ?? 0) +
  sumActualByPrefix(a.lineMap, "cogs_") +
  (a.lineMap.brexCard ?? 0) +
  sumActualByPrefix(a.lineMap, "opex_") +
  (a.lineMap.rent ?? 0);

export const joinWeeks = (model: ModelWeekRow[], actuals: WeeklyActualRow[]): JoinedWeek[] => {
  const actualByWeek = new Map<string, WeeklyActualRow>();
  for (const a of actuals) {
    const hasAny =
      (a.closing_cash_balance && a.closing_cash_balance !== 0) ||
      Object.keys(a.lineMap).length > 0;
    if (hasAny) actualByWeek.set(a.week_start_date, a);
  }

  const out: JoinedWeek[] = [];
  for (const m of model) {
    const a = actualByWeek.get(m.week_start_date);
    if (!a) continue;

    const modeledBreakdown: CashFlowBreakdown = {
      stripe: Number(m.stripe_revenue),
      enterprise: Number(m.enterprise_revenue),
      ar: Number(m.ar_collections),
      payroll: Number(m.payroll),
      cogs: Number(m.cogs),
      card: Number(m.card_payments),
      opex: Number(m.opex),
      rent: Number(m.rent),
    };
    const actualBreakdown: CashFlowBreakdown = {
      stripe: a.lineMap.stripeRevenue ?? 0,
      enterprise: a.lineMap.enterpriseRevenue ?? 0,
      ar: a.lineMap.arCollections ?? 0,
      payroll: a.lineMap.payroll ?? 0,
      cogs: sumActualByPrefix(a.lineMap, "cogs_"),
      card: a.lineMap.brexCard ?? 0,
      opex: sumActualByPrefix(a.lineMap, "opex_"),
      rent: a.lineMap.rent ?? 0,
    };

    const modeledInflows = sumModeledInflows(m);
    const modeledOutflows = sumModeledOutflows(m);
    const actualInflows = computeActualInflows(a);
    const actualOutflows = computeActualOutflows(a);
    const modeledBurn = modeledOutflows - modeledInflows;
    const actualBurn = actualOutflows - actualInflows;

    const modeledClosing = Number(m.closing_balance);
    const actualClosing = a.closing_cash_balance || a.lineMap.closingBalance || 0;

    const lines: JoinedLine[] = [];
    for (const def of LINE_DEFS) {
      const modeled = def.modeled(m);
      const actual = a.lineMap[def.key] ?? 0;
      if (modeled === 0 && actual === 0) continue;
      const { delta, pct } = computeVariance(modeled, actual);
      lines.push({ key: def.key, label: def.label, group: def.group, modeled, actual, delta, pct });
    }
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
      modeledInflows,
      modeledOutflows,
      actualInflows,
      actualOutflows,
      modeledBreakdown,
      actualBreakdown,
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
  averagePct: number;
  cumulativeAbsDollar: number;
  averageDollar: number;
}

/** Per-week top variance drivers (by absolute dollar delta), excluding rollups. */
export const topVarianceDriversForWeek = (week: JoinedWeek, n = 3) => {
  return week.lines
    .filter((l) => l.key !== "cogsTotal" && l.key !== "opexTotal")
    .map((l) => ({ ...l, absDelta: Math.abs(l.delta) }))
    .sort((a, b) => b.absDelta - a.absDelta)
    .slice(0, n);
};

export const topVarianceDrivers = (joined: JoinedWeek[], n = 3): VarianceDriver[] => {
  const acc = new Map<
    string,
    { label: string; sumAbs: number; sumSigned: number; sumAbsDollar: number; sumSignedDollar: number; count: number }
  >();
  for (const w of joined) {
    for (const l of w.lines) {
      if (l.key === "cogsTotal" || l.key === "opexTotal") continue;
      const cur = acc.get(l.key) ?? {
        label: l.label,
        sumAbs: 0,
        sumSigned: 0,
        sumAbsDollar: 0,
        sumSignedDollar: 0,
        count: 0,
      };
      cur.sumAbs += Math.abs(l.pct);
      cur.sumSigned += l.pct;
      cur.sumAbsDollar += Math.abs(l.delta);
      cur.sumSignedDollar += l.delta;
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
      cumulativeAbsDollar: v.sumAbsDollar,
      averageDollar: v.count > 0 ? v.sumSignedDollar / v.count : 0,
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
      `A/R collections have come in ${avgPct.toFixed(0)}% below model for ${trailingBelow} consecutive weeks — consider revising collection timing assumptions.`,
    );
  }

  const avgModeledBurn = joined.reduce((s, w) => s + w.modeledBurn, 0) / joined.length;
  const avgActualBurn = joined.reduce((s, w) => s + w.actualBurn, 0) / joined.length;
  const burnDelta = avgActualBurn - avgModeledBurn;
  if (burnDelta > 5_000) {
    const drivers = topVarianceDrivers(joined, 1);
    const driverLabel = drivers[0]?.label ?? "an unidentified line";
    insights.push(
      `Actual burn rate is tracking ${fmtMoney(burnDelta)} above model — driven primarily by ${driverLabel}.`,
    );
  } else if (burnDelta < -5_000) {
    insights.push(
      `Actual burn rate is tracking ${fmtMoney(Math.abs(burnDelta))} below model — burn is contained relative to forecast.`,
    );
  }

  const payrollLines = joined
    .map((w) => w.lines.find((l) => l.key === "payroll"))
    .filter((l): l is NonNullable<typeof l> => !!l && l.modeled > 0);
  if (payrollLines.length > 0) {
    const avgPct = payrollLines.reduce((s, l) => s + l.pct, 0) / payrollLines.length;
    if (avgPct > 5) {
      const earliest = joined[0].weekStart;
      const latest = joined[joined.length - 1].weekStart;
      const recentHires = hires.filter((h) => h.start_date >= earliest && h.start_date <= latest);
      const hireBlurb =
        recentHires.length > 0
          ? `likely from ${recentHires.slice(0, 3).map((h) => h.name).join(", ")}${recentHires.length > 3 ? ` +${recentHires.length - 3} more` : ""}`
          : "potentially unbudgeted comp adjustments";
      insights.push(`Payroll is tracking ${avgPct.toFixed(0)}% above model — ${hireBlurb}.`);
    }
  }

  const tail = joined.slice(-4).filter((w) => w.actualRunwayMonths != null);
  if (tail.length >= 2) {
    const first = tail[0].actualRunwayMonths!;
    const last = tail[tail.length - 1].actualRunwayMonths!;
    const drop = first - last;
    if (drop > 0.5) {
      insights.push(
        `Runway has contracted by ${drop.toFixed(1)} months over the last ${tail.length} weeks.`,
      );
    }
  }

  // TODO: LLM INTEGRATION — uncomment when ANTHROPIC_API_KEY is set
  // insights.push("AI analysis will appear here once the Anthropic API key is configured. To enable: add ANTHROPIC_API_KEY to Supabase secrets.");

  return insights;
};
