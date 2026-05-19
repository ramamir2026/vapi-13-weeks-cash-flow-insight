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

const COGS_VENDOR_WEEKS: Record<string, number[]> = {
  cogs_anthropic:  [5, 9],
  cogs_azure:      [1, 5, 10],
  cogs_openai:     [1, 5, 9],
  cogs_elevenlabs: [1, 6, 10],
  cogs_deepgram:   [],
  cogs_pump_aws:   [3, 7, 11],
  cogs_twilio:     [4, 8, 12],
};

const COGS_LABELS: Record<string, string> = {
  cogs_anthropic: "Anthropic",
  cogs_azure: "Azure",
  cogs_openai: "OpenAI",
  cogs_elevenlabs: "ElevenLabs",
  cogs_deepgram: "Deepgram",
  cogs_pump_aws: "Pump/AWS",
  cogs_twilio: "Twilio",
  cogs_other: "Other COGS",
};

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

const PAYROLL_WEEKS = new Set([2, 4, 6, 8, 11, 13]);
const COGS_GROWTH_KEYS = new Set(["cogs_anthropic", "cogs_azure"]);
const COGS_MONTHLY_GROWTH = 0.07;
const WEEKS_PER_MONTH = 4.333;

export interface ArOverride {
  weeks: number[];
  delay_days: number;
}

export interface HireOverride {
  weeks: number[];
}

export const buildForecast = (
  assumptions: AssumptionMap,
  arEntries: ARForecastEntry[],
  hires: HireForecastEntry[],
  weeksCount = 13,
  startDate?: Date,
  arOverride?: ArOverride | null,
  hireOverride?: HireOverride | null,
): ForecastResult => {
  const start = startOfWeek(startDate ?? new Date(), { weekStartsOn: 1 });

  const cashKeys = [
    "cash_svb_mm",
    "cash_brex_treasury",
    "cash_brex_primary",
    "cash_svb_checking",
    "cash_stripe_clearing",
    "cash_ramp_checking",
    "cash_ramp_treasury",
  ];
  const cashSum = cashKeys.reduce((s, k) => s + (assumptions[k] ?? 0), 0);
  const opening = cashSum > 0 ? cashSum : assumptions["opening_cash_balance"] ?? 0;
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

  const brexByWeek: Record<number, number> = {
    5: assumptions["brex_w2"] ?? 0,
    9: assumptions["brex_w7"] ?? 0,
  };

  const weekStartDates: Date[] = [];
  for (let i = 0; i < weeksCount; i++) weekStartDates.push(addDays(start, i * 7));

  const cogsRows: VendorRow[] = [];
  for (const key of Object.keys(COGS_VENDOR_WEEKS)) {
    const monthlyBase = assumptions[key] ?? 0;
    const positions = COGS_VENDOR_WEEKS[key];
    const arr = new Array(weeksCount).fill(0);
    for (const w of positions) {
      const idx = w - 1;
      if (idx >= 0 && idx < weeksCount) {
        const monthIdx = Math.floor(idx / WEEKS_PER_MONTH);
        const monthly = COGS_GROWTH_KEYS.has(key)
          ? monthlyBase * Math.pow(1 + COGS_MONTHLY_GROWTH, monthIdx)
          : monthlyBase;
        arr[idx] = monthly;
      }
    }
    cogsRows.push({ key, label: COGS_LABELS[key], weeks: arr });
  }
  {
    const monthly = assumptions["cogs_other"] ?? 0;
    const perWeek = monthly / WEEKS_PER_MONTH;
    cogsRows.push({
      key: "cogs_other",
      label: COGS_LABELS["cogs_other"],
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

  const rentRow = new Array(weeksCount).fill(0);
  const rentPaymentIndices = [4, 8];
  for (const idx of rentPaymentIndices) {
    if (idx >= weeksCount) continue;
    const m = weekStartDates[idx].getMonth();
    rentRow[idx] = m >= 9 ? rentOctPlus : rentMaySep;
  }

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
    const weekNum = i + 1;

    const monthIndex = Math.floor(i / WEEKS_PER_MONTH);
    const stripeRevenue = stripeDaily * 5 * Math.pow(1 + stripeGrowthMonthly, monthIndex);
    const enterpriseRevenue = enterpriseWeekly;
    const arCollections = arPerWeek[i];

    let payroll = 0;
    if (PAYROLL_WEEKS.has(weekNum)) {
      payroll = payrollSemi + payrollFee;
      if (hireOverride?.weeks?.[i] != null) {
        payroll += Number(hireOverride.weeks[i]) || 0;
      } else {
        const activeHires = hires.filter((h) => new Date(h.start_date) <= weekEnd);
        payroll += activeHires.reduce((s, h) => s + Number(h.annual_salary) / 24, 0);
      }
    }

    const cogsTotal = cogsRows.reduce((s, r) => s + r.weeks[i], 0);
    const brexCard = brexByWeek[weekNum] ?? 0;
    const opexTotal = opexRows.reduce((s, r) => s + r.weeks[i], 0);
    const rent = rentRow[i];

    const totalInflows = stripeRevenue + enterpriseRevenue + arCollections;
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
  const lastWeek = weeks[weeks.length - 1];

  return {
    weeks,
    cogsRows,
    opexRows,
    rentRow,
    averageWeeklyBurn,
    monthlyBurn: lastWeek?.trailingMonthlyBurn ?? null,
    runwayMonths: lastWeek?.runwayMonths ?? null,
    endingBalance,
    cashOutDate: lastWeek?.cashOutDate ?? null,
    minCashThreshold,
  };
};
