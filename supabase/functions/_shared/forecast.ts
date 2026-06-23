// MIRROR of src/lib/forecast.ts — keep logic in sync.
// Edge functions can't import from src/, so the implementation is duplicated.
// Only the date-fns import path differs (esm.sh for Deno).
import { addDays, addMonths, format, startOfWeek } from "https://esm.sh/date-fns@3.6.0";

export type AssumptionMap = Record<string, number>;

export interface ARForecastEntry {
  expected_collection_date: string;
  invoice_amount: number;
  status: string;
}

export interface HireForecastEntry {
  start_date: string;
  annual_salary: number;
}

export interface VendorRow {
  key: string;
  label: string;
  weeks: number[];
}

export interface OpExRow {
  key: string;
  label: string;
  weeks: number[];
}

export interface ForecastWeek {
  weekIndex: number;
  weekStartDate: Date;
  openingBalance: number;
  stripeRevenue: number;
  enterpriseRevenue: number;
  arCollections: number;
  totalInflows: number;
  payroll: number;
  cogsTotal: number;
  brexCard: number;
  opexTotal: number;
  rent: number;
  totalOutflows: number;
  netChange: number;
  closingBalance: number;
  belowFloor: boolean;
  headroom: number;
  trailingMonthlyBurn: number | null;
  runwayMonths: number | null;
  cashOutDate: string | null;
}

export interface ForecastResult {
  weeks: ForecastWeek[];
  cogsRows: VendorRow[];
  opexRows: OpExRow[];
  rentRow: number[];
  averageWeeklyBurn: number;
  monthlyBurn: number | null;
  runwayMonths: number | null;
  endingBalance: number;
  cashOutDate: string | null;
  minCashThreshold: number;
  actualMonthlyBurn: number | null;
  actualRunwayMonths: number | null;
}

export const buildAssumptionMap = (
  rows: Array<{ key: string; value: number | string }>,
): AssumptionMap => {
  const map: AssumptionMap = {};
  for (const row of rows) {
    map[row.key] = typeof row.value === "string" ? parseFloat(row.value) : row.value;
  }
  return map;
};

// ============ Calendar placement helpers ============
const adjustForward = (d: Date): Date => {
  const dow = d.getDay();
  if (dow === 6) return addDays(d, 2);
  if (dow === 0) return addDays(d, 1);
  return d;
};

const adjustPayroll = (d: Date): Date => {
  const dow = d.getDay();
  if (dow === 6) return addDays(d, -1);
  if (dow === 0) return addDays(d, 1);
  return d;
};

const weekIndexOf = (date: Date, weekStarts: Date[]): number => {
  const t = date.getTime();
  for (let i = 0; i < weekStarts.length; i++) {
    const s = weekStarts[i].getTime();
    const e = s + 7 * 86_400_000;
    if (t >= s && t < e) return i;
  }
  return -1;
};

const monthsInWindow = (weekStarts: Date[]): Array<{ y: number; m: number }> => {
  const seen = new Set<string>();
  const out: Array<{ y: number; m: number }> = [];
  for (const ws of weekStarts) {
    for (let d = 0; d < 7; d++) {
      const dt = addDays(ws, d);
      const k = `${dt.getFullYear()}-${dt.getMonth()}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ y: dt.getFullYear(), m: dt.getMonth() });
      }
    }
  }
  return out;
};

interface Placement {
  weekIdx: number;
  ordinal: number;
}

const paymentPlacements = (
  payDay: number,
  adjust: (d: Date) => Date,
  weekStarts: Date[],
  cadenceMonths = 1,
): Placement[] => {
  const months = monthsInWindow(weekStarts);
  const hits: Array<{ monthAbs: number; weekIdx: number }> = [];
  for (const { y, m } of months) {
    const adj = adjust(new Date(y, m, payDay));
    const wi = weekIndexOf(adj, weekStarts);
    if (wi >= 0) hits.push({ monthAbs: y * 12 + m, weekIdx: wi });
  }
  if (!hits.length) return [];
  const anchor = hits[0].monthAbs;
  const out: Placement[] = [];
  for (const h of hits) {
    const delta = h.monthAbs - anchor;
    if (delta % cadenceMonths !== 0) continue;
    out.push({ weekIdx: h.weekIdx, ordinal: delta / cadenceMonths });
  }
  return out;
};

export const buildWeekStartDates = (startDate: Date | undefined, weeksCount = 13): Date[] => {
  const start = startOfWeek(startDate ?? new Date(), { weekStartsOn: 1 });
  const out: Date[] = [];
  for (let i = 0; i < weeksCount; i++) out.push(addDays(start, i * 7));
  return out;
};

export const payrollWeekIndices = (weekStarts: Date[]): number[] => {
  const placements = [
    ...paymentPlacements(12, adjustPayroll, weekStarts),
    ...paymentPlacements(27, adjustPayroll, weekStarts),
  ];
  return [...new Set(placements.map((p) => p.weekIdx))].sort((a, b) => a - b);
};

interface CogsVendor {
  key: string;
  label: string;
  payDay: number;
  growth?: number;
  cadenceMonths?: number;
}
const COGS_VENDORS: CogsVendor[] = [
  { key: "cogs_pump_aws", label: "Pump/AWS", payDay: 15 },
  { key: "cogs_anthropic", label: "Anthropic", payDay: 1 },
  { key: "cogs_azure", label: "Azure", payDay: 5, growth: 0.07 },
  { key: "cogs_openai", label: "OpenAI", payDay: 1, growth: 0.03 },
  { key: "cogs_deepgram", label: "Deepgram", payDay: 2, cadenceMonths: 3 },
  { key: "cogs_gemini", label: "Google / Gemini", payDay: 21 },
  { key: "cogs_twilio", label: "Twilio", payDay: 24 },
  { key: "cogs_elevenlabs", label: "ElevenLabs", payDay: 15 },
];

const OPEX_KEYS = [
  "opex_sm",
  "opex_software",
  "opex_legal",
  "opex_deel",
  "opex_hr_te",
  "opex_recruiting",
  "opex_ga",
] as const;

const OPEX_LABELS: Record<string, string> = {
  opex_sm: "S&M",
  opex_software: "Software",
  opex_legal: "Legal",
  opex_deel: "Deel",
  opex_hr_te: "HR / T&E",
  opex_recruiting: "Recruiting",
  opex_ga: "G&A",
};

const WEEKS_PER_MONTH = 4.333;

export interface ArOverride {
  weeks: number[];
  delay_days: number;
}

export interface HireOverride {
  weeks: number[];
}

// AP-aging override: per-vendor weekly dollars for W1..W5 (length 5).
// `cogs_other` is NEVER driven from AP — it stays smoothed from assumptions.
export interface ApOverride {
  weeks_by_vendor: Record<string, number[]>;
}

const AP_OVERRIDE_HORIZON = 5;

export const buildForecast = (
  assumptions: AssumptionMap,
  arEntries: ARForecastEntry[],
  hires: HireForecastEntry[],
  weeksCount = 13,
  startDate?: Date,
  arOverride?: ArOverride | null,
  hireOverride?: HireOverride | null,
  // Assumption keys for active, non-restricted accounts (from accounts table).
  activeCashKeys?: string[],
  apOverride?: ApOverride | null,
): ForecastResult => {

  const start = startOfWeek(startDate ?? new Date(), { weekStartsOn: 1 });

  const keys = activeCashKeys ?? [];
  const cashSum = keys.reduce((s, k) => s + (assumptions[k] ?? 0), 0);
  const opening = keys.length > 0 ? cashSum : assumptions["opening_cash_balance"] ?? 0;
  const minCashThreshold = assumptions["min_cash_threshold"] ?? 15_000_000;

  const stripeDaily = assumptions["stripe_daily_rate"] ?? 0;
  const stripeGrowthMonthly = (assumptions["stripe_growth_pct"] ?? 0) / 100;
  const enterpriseWeekly = assumptions["enterprise_ach_weekly"] ?? 0;

  const arDelayDays = assumptions["ar_delay_days"] ?? 0;
  const arDelayWeeks = Math.round(arDelayDays / 7);

  const payrollSemi = assumptions["payroll_semi_monthly"] ?? 0;
  const payrollFee = assumptions["payroll_processing_fee"] ?? 0;
  const oneTimeW2 = assumptions["one_time_vendor_w2"] ?? assumptions["one_time_w2"] ?? 0;

  const rentMaySep = assumptions["rent_may_sep"] ?? 0;
  const rentOctPlus = assumptions["rent_oct_plus"] ?? 0;

  const weekStartDates: Date[] = [];
  for (let i = 0; i < weeksCount; i++) weekStartDates.push(addDays(start, i * 7));

  const payrollWeekSet = new Set(payrollWeekIndices(weekStartDates));

  const firstOfMonthPlacements = paymentPlacements(1, adjustForward, weekStartDates);
  const cardAmounts = [
    assumptions["brex_w2"] ?? 0,
    assumptions["brex_w7"] ?? 0,
    assumptions["brex_w11"] ?? 0,
  ];
  const brexByWeekIdx: Record<number, number> = {};
  const rentRow = new Array(weeksCount).fill(0);
  firstOfMonthPlacements.forEach((p, idx) => {
    if (idx < cardAmounts.length) {
      brexByWeekIdx[p.weekIdx] = (brexByWeekIdx[p.weekIdx] ?? 0) + cardAmounts[idx];
    }
    const monthHere = weekStartDates[p.weekIdx].getMonth();
    rentRow[p.weekIdx] = monthHere >= 9 ? rentOctPlus : rentMaySep;
  });


  const cogsRows: VendorRow[] = [];
  for (const v of COGS_VENDORS) {
    const base = assumptions[v.key] ?? 0;
    const arr = new Array(weeksCount).fill(0);
    if (base > 0) {
      const growth = v.growth ?? 0;
      for (const p of paymentPlacements(v.payDay, adjustForward, weekStartDates, v.cadenceMonths ?? 1)) {
        arr[p.weekIdx] += base * Math.pow(1 + growth, p.ordinal);
      }
    }
    cogsRows.push({ key: v.key, label: v.label, weeks: arr });
  }

  // ============ AP override (W1..W5) ============
  // For each mapped COGS vendor present in the override, replace W1..W5 with
  // the AP-derived totals. Vendors NOT in the override stay on the calendar
  // pay-day model. `cogs_other` is never touched.
  if (apOverride && apOverride.weeks_by_vendor) {
    const horizon = Math.min(AP_OVERRIDE_HORIZON, weeksCount);
    for (const row of cogsRows) {
      if (row.key === "cogs_other") continue;
      const v = apOverride.weeks_by_vendor[row.key];
      if (!Array.isArray(v)) continue;
      for (let w = 0; w < horizon; w++) {
        row.weeks[w] = Number(v[w]) || 0;
      }
    }
  }

  {

    const monthly = assumptions["cogs_other"] ?? 0;
    const perWeek = monthly / WEEKS_PER_MONTH;
    cogsRows.push({
      key: "cogs_other",
      label: "Other COGS",
      weeks: new Array(weeksCount).fill(perWeek),
    });
  }

  const opexRows: OpExRow[] = OPEX_KEYS.map((key) => {
    const monthly = assumptions[key] ?? 0;
    const perWeek = monthly / WEEKS_PER_MONTH;
    const arr = new Array(weeksCount).fill(perWeek);
    if (key === "opex_ga") {
      arr[1] = perWeek + oneTimeW2;
    }
    return { key, label: OPEX_LABELS[key], weeks: arr };
  });

  let arPerWeek: number[];
  if (arOverride && Array.isArray(arOverride.weeks) && arOverride.weeks.length > 0) {
    arPerWeek = new Array(weeksCount).fill(0);
    for (let i = 0; i < weeksCount; i++) {
      arPerWeek[i] = Number(arOverride.weeks[i]) || 0;
    }
  } else {
    arPerWeek = new Array(weeksCount).fill(0);
    for (const e of arEntries) {
      if (e.status === "written_off" || e.status === "collected") continue;
      const expected = addDays(new Date(e.expected_collection_date), arDelayWeeks * 7);
      const expectedWeekStart = startOfWeek(expected, { weekStartsOn: 1 });
      const idx = Math.round(
        (expectedWeekStart.getTime() - start.getTime()) / (7 * 86400000),
      );
      if (idx >= 0 && idx < weeksCount) arPerWeek[idx] += Number(e.invoice_amount);
    }
  }

  const weeks: ForecastWeek[] = [];
  let running = opening;

  for (let i = 0; i < weeksCount; i++) {
    const weekStart = weekStartDates[i];
    const weekEnd = addDays(weekStart, 6);

    const monthIndex = Math.floor(i / WEEKS_PER_MONTH);
    const stripeRevenue = stripeDaily * 5 * Math.pow(1 + stripeGrowthMonthly, monthIndex);
    const enterpriseRevenue = enterpriseWeekly;
    const arCollections = arPerWeek[i];

    let payroll = 0;
    if (payrollWeekSet.has(i)) {
      payroll = payrollSemi + payrollFee;
      if (hireOverride?.weeks?.[i] != null) {
        payroll += Number(hireOverride.weeks[i]) || 0;
      } else {
        const activeHires = hires.filter((h) => new Date(h.start_date) <= weekEnd);
        payroll += activeHires.reduce((s, h) => s + Number(h.annual_salary) / 24, 0);
      }
    }

    const cogsTotal = cogsRows.reduce((s, r) => s + r.weeks[i], 0);
    const brexCard = brexByWeekIdx[i] ?? 0;
    const opexTotal = opexRows.reduce((s, r) => s + r.weeks[i], 0);
    const rent = rentRow[i];


    // Cash inflows = Stripe run-rate + Enterprise ACH run-rate ONLY.
    // Enterprise collections are already counted once here via enterprise_ach_weekly,
    // so we deliberately do NOT add arCollections to the cash total — doing so would
    // double-count the same dollars. The AR schedule is a risk register / timing view
    // (which invoices are expected when), not an independent cash source.
    const totalInflows = stripeRevenue + enterpriseRevenue;
    const totalOutflows = payroll + cogsTotal + brexCard + opexTotal + rent;
    const netChange = totalInflows - totalOutflows;
    const openingBalance = running;
    const closingBalance = openingBalance + netChange;
    running = closingBalance;

    weeks.push({
      weekIndex: i,
      weekStartDate: weekStart,
      openingBalance,
      stripeRevenue,
      enterpriseRevenue,
      arCollections,
      totalInflows,
      payroll,
      cogsTotal,
      brexCard,
      opexTotal,
      rent,
      totalOutflows,
      netChange,
      closingBalance,
      belowFloor: closingBalance < minCashThreshold,
      headroom: closingBalance - minCashThreshold,
      trailingMonthlyBurn: null,
      runwayMonths: null,
      cashOutDate: null,
    });
  }

  for (let i = 0; i < weeks.length; i++) {
    const windowStart = Math.max(0, i - 3);
    const slice = weeks.slice(windowStart, i + 1);
    const avgNet = slice.reduce((s, w) => s + w.netChange, 0) / slice.length;
    const monthlyBurn = -avgNet * WEEKS_PER_MONTH;
    const isPositive = monthlyBurn <= 0;
    weeks[i].trailingMonthlyBurn = isPositive ? null : monthlyBurn;
    if (isPositive) {
      weeks[i].runwayMonths = null;
      weeks[i].cashOutDate = null;
    } else {
      const runway = weeks[i].closingBalance / monthlyBurn;
      weeks[i].runwayMonths = runway;
      const cashOut = addMonths(new Date(), Math.max(0, runway));
      weeks[i].cashOutDate = format(cashOut, "MMM yyyy");
    }
  }

  const burns = weeks.map((w) => Math.max(0, -w.netChange));
  const averageWeeklyBurn = burns.reduce((a, b) => a + b, 0) / Math.max(1, weeks.length);
  const endingBalance = weeks[weeks.length - 1]?.closingBalance ?? opening;

  // Whole-window headline burn: net cash consumed across the full forecast horizon,
  // annualized to a monthly rate. This is the model's view of burn (vs. the per-week
  // trailing burn used for chart shading).
  const windowMonths = weeksCount / WEEKS_PER_MONTH;
  const monthlyBurn = windowMonths > 0 ? -(endingBalance - opening) / windowMonths : 0;
  const runwayMonths = monthlyBurn > 0 ? opening / monthlyBurn : null;
  const cashOutDate =
    monthlyBurn > 0 && runwayMonths != null
      ? format(addMonths(new Date(), runwayMonths), "MMM yyyy")
      : null;

  // Bank-measured actual burn, surfaced from assumptions so the UI can show it
  // alongside the model burn (e.g. ~$2.0M/mo from real bank outflows).
  const actualTrailingBurn = assumptions["actual_trailing_burn"] ?? 0;
  const actualMonthlyBurn = actualTrailingBurn > 0 ? actualTrailingBurn : null;
  const actualRunwayMonths =
    actualMonthlyBurn != null && actualMonthlyBurn > 0 ? opening / actualMonthlyBurn : null;

  return {
    weeks,
    cogsRows,
    opexRows,
    rentRow,
    averageWeeklyBurn,
    monthlyBurn: monthlyBurn > 0 ? monthlyBurn : null,
    runwayMonths,
    endingBalance,
    cashOutDate,
    minCashThreshold,
    actualMonthlyBurn,
    actualRunwayMonths,
  };
};
