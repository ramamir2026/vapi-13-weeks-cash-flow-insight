# Variance & Insights Page

A new sidebar entry that compares the saved forecast snapshots (`model_weeks`) against the entered actuals (`weekly_actuals`) for every week where both exist.

## What you'll see

**Header**: page title + small caption ("Comparing modeled vs actual for completed weeks").

### Section 1 — Weekly Variance Table
Columns: Week (e.g. `Apr 14–20`), Modeled Closing, Actual Closing, Variance $, Variance %, Modeled Burn, Actual Burn, Status badge.

Status thresholds (based on absolute closing-balance variance %):
- **On Track** — within 5% (green)
- **Watch** — 5–15% (amber)
- **Off Track** — >15% (red)

Variance $ colored green if positive (actual better than model), red if negative. Rows are clickable to expand into Section 2.

### Section 2 — Line-Item Drill Down (inline expandable)
When a week row is clicked, the row expands to show every line item that the dashboard tracks:
Stripe Revenue, Enterprise ACH, A/R Collections, Payroll, each COGS vendor (Anthropic, Azure, OpenAI, ElevenLabs, Deepgram, Pump/AWS, Twilio, Other COGS), Brex Card, each OpEx line (S&M, Software, Legal, Deel, HR/T&E, Recruiting, G&A), Rent.

For each: Modeled / Actual / Variance $ / Variance %. Rows where |variance %| > 10% are highlighted in red/amber.

### Section 3 — Trend Charts (4 small charts in a responsive grid, recharts)
1. **Closing Balance** — modeled (dotted) vs actual (solid) line chart across all completed weeks
2. **Weekly Burn Rate** — modeled vs actual line chart
3. **Runway Months** — actual runway trend (closing / monthly burn) line chart
4. **Top 3 Variance Drivers** — horizontal bar chart of the line items with the largest cumulative |variance %| across completed weeks

### Section 4 — Insights Panel
Auto-generated bullets based on the computed series. Rules:
- **A/R drag**: if `arCollections` actual is X% below model for ≥3 consecutive completed weeks → `"A/R collections X% below model for N weeks — consider revising collection timing."`
- **Burn pressure**: if avg actual burn over completed weeks is >$5K above modeled burn → `"Actual burn tracking $Xk above model — driven primarily by [highest |variance| line]."`
- **Payroll over**: if `payroll` actual avg >5% above model → `"Payroll tracking X% above model — likely from new hires that started in [week]."` (cross-references `future_hires` whose `start_date` falls inside the affected window)
- **Runway compression**: compare runway months in earliest vs latest of last 4 completed weeks → `"Runway has contracted by X months over the last 4 weeks."`

Show "No insights yet — need at least 2 completed weeks of actuals" when too little data.

## Technical implementation

### Data sources
- **Modeled snapshot**: latest `model_weeks` rows (one snapshot = `snapshot_id`). Query for the most recent `snapshot_id` and pull all its weeks.
- **Actuals**: all `weekly_actuals` rows. Per-line-item values live in `weekly_actuals.notes` as JSON keyed by the row keys already used by the dashboard:
  `stripeRevenue, enterpriseRevenue, arCollections, payroll, brexCard, rent, closingBalance, cogs_cogs_anthropic, cogs_cogs_azure, cogs_cogs_openai, cogs_cogs_elevenlabs, cogs_cogs_deepgram, cogs_cogs_pump_aws, cogs_cogs_twilio, cogs_cogs_other, opex_opex_sm, opex_opex_software, opex_opex_legal, opex_opex_deel, opex_opex_hr_te, opex_opex_recruiting, opex_opex_ga`.
  `closing_cash_balance` column is the canonical closing.
- **Completed week** = a `week_start_date` that exists in **both** the latest snapshot's `model_weeks` and `weekly_actuals` (with non-zero closing or any actuals entered).

### New files
- `src/hooks/useVariance.ts` — `useLatestSnapshotWeeks()` and `useAllWeeklyActuals()` React Query hooks.
- `src/lib/varianceAnalysis.ts` — pure functions:
  - `joinWeeks(modelWeeks, actuals)` → array of `{ weekStart, modeled: {…lines, closing, burn}, actual: {…lines, closing, burn} }`
  - `lineItemDefs` — ordered list mapping display label → modeled key (on `model_weeks` row or computed) → actuals key (in JSON map)
  - `computeVariance(modeled, actual)` → `{ delta, pct, status }`
  - `topVarianceDrivers(joined)` → top 3 line items by cumulative |pct|
  - `generateInsights(joined, hires)` → string[] using the rules above
- `src/pages/VarianceInsights.tsx` — the page.
- `src/components/variance/WeeklyVarianceTable.tsx` — Section 1 + expandable Section 2 (uses Radix Collapsible per row).
- `src/components/variance/VarianceLineDrillDown.tsx` — Section 2 inner table.
- `src/components/variance/TrendCharts.tsx` — Section 3, four `recharts` charts in a `grid grid-cols-1 lg:grid-cols-2 gap-4`.
- `src/components/variance/InsightsPanel.tsx` — Section 4 list with icons and severity colors.

### Wiring
- `src/App.tsx` — add `<Route path="/variance" element={<Shell><VarianceInsights /></Shell>} />`.
- `src/components/AppLayout.tsx` — add `{ to: "/variance", label: "Variance & Insights", icon: TrendingUp }` to `baseNavItems` (between Future Hires and Bank Imports).

### Burn calculation
For each week, `burn = totalOutflows - totalInflows` (positive = burning cash). For modeled, derive from the snapshot row: `(payroll + cogs + card_payments + opex + rent) - (stripe_revenue + enterprise_revenue + ar_collections)`. For actual, sum the same line items from the JSON map; fall back to `opening - closing` when line items aren't entered.

### Empty / edge cases
- No snapshots yet → empty state: "Save a forecast snapshot from the Dashboard to start tracking variance."
- Snapshots exist but no completed weeks have actuals → empty state: "Enter actuals for a past week on the Dashboard to see variance."
- Only some line items entered → show "—" for missing actuals, exclude them from variance/insight calculations.

### Styling
Uses existing semantic tokens: `text-[hsl(var(--success))]`, `text-destructive`, `bg-warning/10`, `border-border`, etc. No new design tokens required. All charts use `hsl(var(--primary))` for actual and `hsl(var(--muted-foreground))` for modeled (dashed `strokeDasharray="4 4"`).

### No DB changes
Reads only — no migrations, no new tables, no new RLS.
