// Semi-monthly payroll periods for hire impact grid.
// weekIndex is the 0-based forecast week to which the period total maps.
// Maps P1→W2, P2→W4, P3→W6, P4→W8, P5→W10, P6→W12 (1-indexed: index+1).

export type PayrollPeriod = {
  key: string;
  label: string;
  start: string; // YYYY-MM-DD
  end: string;
  days: number;
  weekIndex: number; // 0-based
};

export const PAYROLL_PERIODS: PayrollPeriod[] = [
  { key: "P1", label: "Apr 16–30", start: "2026-04-16", end: "2026-04-30", days: 15, weekIndex: 1 },
  { key: "P2", label: "May 1–15", start: "2026-05-01", end: "2026-05-15", days: 15, weekIndex: 3 },
  { key: "P3", label: "May 16–31", start: "2026-05-16", end: "2026-05-31", days: 16, weekIndex: 5 },
  { key: "P4", label: "Jun 1–15", start: "2026-06-01", end: "2026-06-15", days: 15, weekIndex: 7 },
  { key: "P5", label: "Jun 16–30", start: "2026-06-16", end: "2026-06-30", days: 15, weekIndex: 9 },
  { key: "P6", label: "Jul 1–15", start: "2026-07-01", end: "2026-07-15", days: 15, weekIndex: 11 },
];

const dayMs = 86_400_000;

const toDate = (iso: string): Date => {
  // Parse as UTC date to avoid TZ shifting
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * Per-spec formula:
 *   MAX(0, (period_end − MAX(start_date, period_start) + 1) / period_days)
 *   × (annual_salary / 26)
 *
 * fraction is capped at 1 by the formula (eligibleDays > period.days only when
 * start_date precedes period_start, in which case (end − start + 1) / days = 1).
 */
export const periodCellAmount = (
  startDateIso: string | null | undefined,
  annualSalary: number,
  period: PayrollPeriod
): number => {
  if (!startDateIso || !annualSalary) return 0;
  const periodStart = toDate(period.start).getTime();
  const periodEnd = toDate(period.end).getTime();
  const start = toDate(startDateIso).getTime();
  const effectiveStart = Math.max(start, periodStart);
  const eligibleDays = Math.max(0, (periodEnd - effectiveStart) / dayMs + 1);
  const fraction = Math.min(eligibleDays / period.days, 1);
  return fraction * (annualSalary / 26);
};

/**
 * Map period totals to a 13-element forecast weeks array (zeros elsewhere).
 */
export const periodsToWeeks = (periodTotals: Record<string, number>): number[] => {
  const weeks = new Array(13).fill(0);
  for (const p of PAYROLL_PERIODS) {
    weeks[p.weekIndex] = periodTotals[p.key] ?? 0;
  }
  return weeks;
};
