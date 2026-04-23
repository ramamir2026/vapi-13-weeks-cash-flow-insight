

## 13-Week Forecast Grid — Revised Plan

Same scope as the prior plan, with three corrections applied:

### Corrections

1. **COGS vendor week positions (hardcoded per vendor)**

   ```text
   Anthropic   : W2, W7, W11
   Azure       : W3, W8, W12
   OpenAI      : W2, W7, W11
   ElevenLabs  : W3, W8, W12
   Deepgram    : W2 only
   Pump/AWS    : W4, W9, W13
   Twilio      : W3, W8, W12
   Other COGS  : monthly / 4.333 smoothed across every week
   ```

   Each vendor row drops its full monthly amount on the listed weeks; non-listed weeks = 0. `TOTAL COGS` is the sum of all eight vendor rows per week.

2. **Payroll — no tax multiplier**

   - Remove `payroll_taxes_pct` from the assumptions seed and from the engine.
   - Payroll on weeks 2,4,6,8,10,12 = `payroll_semi_monthly` (the $659K base already includes total employer cost).
   - Future hires add `(annual_salary / 24)` per pay period once `start_date` ≤ week end. No tax multiplier.

3. **Rent — two separate assumption keys**

   - `rent_may_sep = 32417` (monthly, applied months May → September)
   - `rent_oct_plus = 64835` (monthly, applied October onward)
   - Engine picks the rate based on the calendar month of each week, drops it on that month's anchor week (W1, W5, W9, W13), divided by 4.333 if smoothed — **kept as monthly drop on the month-anchor week** to mirror real payment cadence.
   - Rent renders as its own row inside the OPEX block (separate from the eight OpEx line items). Single `Rent` row in the grid; the active rate just changes mid-forecast.

### Everything else unchanged from prior plan

- Grid layout, column structure (sticky label, Actuals, W1–W13, Total), color coding, two action buttons (Generate Forecast, Download Excel).
- Row groups: INFLOWS / OUTFLOWS (with COGS subtotal + Brex + OpEx + Rent) / NET & CLOSING / ANALYTICS.
- Engine inputs: Stripe (`stripe_daily_rate × 5 × growth^monthIndex`), Enterprise ACH weekly, A/R shifted by `ar_delay_days`, Brex `{W2:540k, W7:551k, W11:562k}`, OpEx lines `monthly / 4.333` weekly, G&A W2 + `one_time_w2`.
- Analytics: Below $15M floor flag, Headroom, 4-week trailing burn × −4.333, Runway months, Cash-out date.
- New files: `src/components/forecast/ForecastGrid.tsx`, `src/components/forecast/ActualsCell.tsx`, `src/lib/exportExcel.ts`. Rewrite `src/lib/forecast.ts`. Add `useSaveForecastSnapshot` to `src/hooks/useFinanceData.ts`. Add color tokens to `src/index.css`. Add `xlsx` dependency.
- Migration reseeds `assumptions` with the corrected key set (no `payroll_taxes_pct`, no merged `opex_rent`; includes `rent_may_sep` and `rent_oct_plus`).

