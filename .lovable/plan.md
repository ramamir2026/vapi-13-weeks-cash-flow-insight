## Future Hires Tab Rebuild

Replace the current dialog-based hires page with a spreadsheet-style hire table, CSV importer, and a 6-period payroll impact grid that snapshots into the forecast model.

### 1. Database changes

**Migration** — add `status` to `future_hires` and create `hire_payroll_overrides` snapshot table.

```sql
-- Add status enum + column
CREATE TYPE public.hire_status AS ENUM ('confirmed', 'offer_sent', 'interviewing');

ALTER TABLE public.future_hires
  ADD COLUMN status public.hire_status NOT NULL DEFAULT 'interviewing';

-- Snapshot table for payroll-impact totals applied to the forecast
CREATE TABLE public.hire_payroll_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_start date NOT NULL,
  periods jsonb NOT NULL,        -- [{ key:'P1', total:number }, ...]  length 6
  weeks jsonb NOT NULL,          -- length 13, totals mapped to W2/4/6/8/10/12
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hire_payroll_overrides ENABLE ROW LEVEL SECURITY;
-- authenticated full access policies (mirrors ar_weekly_overrides)
CREATE INDEX idx_hire_payroll_overrides_forecast_start
  ON public.hire_payroll_overrides(forecast_start DESC, created_at DESC);
```

The `periods` JSON is the per-hire detail (kept for traceability); `weeks` is what the forecast engine consumes.

### 2. Forecast engine update (`src/lib/forecast.ts`)

- Add optional `hireOverride?: { weeks: number[] }` parameter to `buildForecast`.
- Inside the per-week assembly, replace the existing `activeHires.reduce(...)` add-on (which currently uses `annual_salary / 24` on every payroll week) with **either**:
  - `hireOverride.weeks[i]` when provided (preferred, this is the precomputed period total), or
  - existing legacy fallback for backwards compatibility.
- Mapping is already correct: payroll weeks are W2/4/6/8/10/12 (1-indexed), which match P1–P6. The `weeks[]` array passed in will only have non-zero values at those indices.

### 3. Data hooks (`src/hooks/useFinanceData.ts`)

- Extend `FutureHire` type with `status: 'confirmed' | 'offer_sent' | 'interviewing'`.
- Add `useHirePayrollOverride()` — fetches latest snapshot for current forecast Monday (mirrors `useArWeeklyOverride`).
- Add `useApplyHirePayrollOverride()` — inserts the snapshot row.

### 4. Future Hires page (`src/pages/FutureHires.tsx`) — full rewrite

#### Hire table (top)

Inline editable spreadsheet (matches the A/R table pattern):

| Name | Role | Annual Salary | Start Date | Status | Notes | ✕ |
|---|---|---|---|---|---|---|

- All cells edit on blur via `useUpsertHire`.
- **Start Date**: Shadcn datepicker (Popover + Calendar with `pointer-events-auto`).
- **Status**: Select with three options. Renders a colored dot inline:
  - Confirmed → `bg-green-500`
  - Offer Sent → `bg-amber-500`
  - Interviewing → `bg-gray-400`
- **Add hire** button inserts a blank draft row at the bottom (saved on first valid name + role + salary + date).
- **✕** uses existing `useDeleteHire`.
- The legacy "Department" column is dropped from the UI (column stays in DB, defaults to null).

#### CSV import

Drag-and-drop dropzone above the table (reuse the styling pattern of `CsvDropzone`):

- New parser `src/lib/parseHiresCsv.ts` — hand-written, no new deps. Tolerant headers:
  - `Name` / `Full Name`
  - `Role` / `Title` / `Position`
  - `Salary` / `Annual Salary` / `Base`
  - `Start Date` / `Start` / `Date`
  - `Status` (mapped: "confirmed"/"signed"/"accepted" → confirmed, "offer"/"offer sent" → offer_sent, anything else / blank → interviewing)
- Preview dialog (new `src/components/hires/HiresCsvPreviewDialog.tsx`) with row checkboxes and inline status edit before commit. Bulk insert via `useUpsertHire` sequentially with a final toast count.

#### Payroll Impact Grid (below the table)

A 6-column grid with one row per hire and a bold TOTAL row.

```text
Hire        | P1 (Apr16-30) | P2 (May1-15) | P3 (May16-31) | P4 (Jun1-15) | P5 (Jun16-30) | P6 (Jul1-15) | Sum
```

Period definitions (hardcoded constant, dates in 2026):

```ts
const PERIODS = [
  { key: 'P1', start: '2026-04-16', end: '2026-04-30', days: 15, weekIndex: 1 },  // W2
  { key: 'P2', start: '2026-05-01', end: '2026-05-15', days: 15, weekIndex: 3 },  // W4
  { key: 'P3', start: '2026-05-16', end: '2026-05-31', days: 16, weekIndex: 5 },  // W6
  { key: 'P4', start: '2026-06-01', end: '2026-06-15', days: 15, weekIndex: 7 },  // W8
  { key: 'P5', start: '2026-06-16', end: '2026-06-30', days: 15, weekIndex: 9 },  // W10
  { key: 'P6', start: '2026-07-01', end: '2026-07-15', days: 15, weekIndex: 11 }, // W12
];
```

Per-cell formula (exactly as specified):

```ts
const eligibleDays = Math.max(0,
  daysBetween(periodEnd, max(startDate, periodStart)) + 1
);
const fraction = eligibleDays / period.days;          // capped at 1 by the formula
const cell = fraction * (annualSalary / 26);
```

Footer TOTAL row sums each period column (bold, `tabular-nums`).

Status filter note: per spec, **all hires** are included in the grid regardless of status (the user opted not to filter). Status is a metadata flag for the table only. If the user later wants to exclude `interviewing`, that's a one-liner toggle.

#### Apply to Model

A button at the top-right of the page (next to "Add hire"):

- Builds a 13-element `weeks[]` array where `weeks[period.weekIndex] = TOTAL[period.key]`, and zeros elsewhere.
- Calls `useApplyHirePayrollOverride.mutate({ weeks, periods: [{key,total}, ...] })`.
- Invalidates `["hire_payroll_overrides"]`, `["future_hires"]`. Toast confirmation.

### 5. Dashboard wiring (`src/pages/Dashboard.tsx`)

- Read `useHirePayrollOverride()` alongside `useArWeeklyOverride()`.
- Pass `hireOverride={ weeks: override?.weeks }` to `buildForecast`. Fallback to existing per-hire computation if no snapshot exists.

### 6. Files touched

- **Migration** (new): adds `hire_status` enum, `future_hires.status` column, and `hire_payroll_overrides` table with RLS + index.
- `src/lib/forecast.ts` — accept `hireOverride`, prefer it over the per-hire reduce.
- `src/hooks/useFinanceData.ts` — extend `FutureHire`, add the two override hooks.
- `src/pages/FutureHires.tsx` — full rewrite (inline grid + CSV dropzone + payroll grid + Apply to Model).
- `src/pages/Dashboard.tsx` — pass hire override into `buildForecast`.
- **New files**:
  - `src/lib/parseHiresCsv.ts`
  - `src/lib/payrollPeriods.ts` (PERIODS constant + per-cell formula helper, shared between page and any future use)
  - `src/components/hires/HireInlineRow.tsx`
  - `src/components/hires/HiresCsvDropzone.tsx`
  - `src/components/hires/HiresCsvPreviewDialog.tsx`
  - `src/components/hires/PayrollImpactGrid.tsx`

### Acceptance

- Hire table edits auto-save; status renders with the correct colored dot.
- CSV drop opens a preview with parsed rows and inline status edit; confirm bulk-inserts.
- Payroll grid math: a hire with `start=2026-04-20`, `salary=260,000` shows P1 = `(11/15) × (260000/26) = 7,333.33`, P2..P6 = `10,000`.
- Clicking **Apply to Model** writes the 6 totals into `hire_payroll_overrides.weeks[]` at indices 1/3/5/7/9/11 and the Dashboard payroll row reflects them on next render.
- Existing dashboard payroll fallback still works when no snapshot exists.
