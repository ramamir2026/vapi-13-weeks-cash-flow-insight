

## Insights & Alerts System (Revised)

End-to-end variance detection with stricter trigger conditions and known-vendor exclusion for one-time payment flags. All actions captured in the existing append-only audit log.

### Threshold revisions (per latest feedback)

- **Trigger condition:** Flag a line only when variance is **>10% AND ≥$5,000** (both must be true). Small dollar amounts at high % no longer flag; large dollar amounts at low % no longer flag.
- **One-time payment check:** Only flag transactions >$100,000 where vendor:
  1. Does not match any `bank_category_rules.vendor_contains` entry, AND
  2. Does not match any known COGS vendor (case-insensitive substring match): **Anthropic, Azure, OpenAI, ElevenLabs, Deepgram, Pump, Twilio, Sequoia One, Deel**.
- **Severity bands** (applied only after the trigger condition above is met):
  - Info: variance 10–20% AND $5K–$10K
  - Warning: variance 20–50% OR $10K–$100K
  - Critical: variance >50% OR >$100K

### 1. Database

**`model_alerts`** — id, week_start_date, category, assumption_key, modeled_amount, actual_amount, variance_pct, variance_dollar, severity (info/warning/critical), status (open/dismissed/resolved), dismissal_reason, dismissed_by, dismissed_at, resolved_at, auto_resolved bool, parent_alert_id, created_at.
- Unique key `(week_start_date, assumption_key, category)` prevents duplicate flags.
- RLS: viewers read; editors update status; approvers reopen.
- Audit trigger attached → `audit_log` rows: `alert_created`, `alert_dismissed`, `alert_resolved`, `alert_reopened`. Reason payload in `new_value` JSON.

**`variance_snapshots`** — week_start_date, assumption_key, modeled, actual. Powers drift dots and trend detection.

### 2. Detection engine — `src/lib/variance.ts`

Runs after CSV import confirm, Generate Forecast, and week sign-off.

Specific checks:
- **Payroll** — Sequoia One ACH vs `payroll_semi_monthly`; trigger if actual >5% higher (special threshold for payroll).
- **Recruiting** — sum of recruiting vendors vs `opex_recruiting`.
- **COGS vendors** — per-vendor actual vs assumption.
- **Pump/AWS** — flag if MoM growth >15%.
- **Brex card** — partial-month run-rate >10% over estimate.
- **A/R collections** — actual >20% below modeled.
- **Opening balance** — sum of 5 cash assumptions vs verified statement balances; flag if >$10K drift.
- **One-time payments** — >$100K with vendor unknown to both `bank_category_rules` and the hardcoded COGS list.
- **Burn rate** — 4-week trailing burn week-over-week growth >15%.

All variance checks (except payroll's 5% rule, opening-balance $10K rule, and one-time $100K rule which have explicit thresholds) gate on the **>10% AND ≥$5,000** condition.

### 3. Trend detector (same module)

- 3 consecutive weekly increases on a cost line → `trend_cost_up`.
- 2 consecutive weekly decreases on an inflow line → `trend_inflow_down`.
- Runway shrinking >2 months/month → `trend_runway` (critical).

### 4. UI

**Alerts panel** (`src/components/dashboard/AlertsPanel.tsx`) — between WeeklyChecklist and KPIs.
- Critical: red banner, always expanded.
- Warning: amber collapsible, count badge.
- Info: gray collapsible, count badge.
- Card actions: Apply (updates assumption + auto-resolves), Dismiss (popover with reason: Acknowledged / One-time / Will fix next cycle / Updating assumption).
- Dismissed archive collapsed below; approver-only Reopen button.

**Assumptions drift dot** — green/amber/red beside each input; hover shows 4-week sparkline (inline SVG).

**Audit Log filter** — add "Alert" option mapping to the four alert lifecycle actions.

### 5. Excel export — third sheet "Variance"

Line item · Modeled · Actual · Variance $ · Variance % · Severity. Amber fill on warning rows, red on critical.

### 6. Hooks — `src/hooks/useAlerts.ts`

`useOpenAlerts`, `useDismissedAlerts`, `useDismissAlert`, `useResolveAlert`, `useReopenAlert`, `useApplyAlertSuggestion`.

### 7. Files

```text
NEW   src/lib/variance.ts
NEW   src/lib/knownVendors.ts                   — hardcoded COGS vendor list
NEW   src/hooks/useAlerts.ts
NEW   src/components/dashboard/AlertsPanel.tsx
NEW   src/components/dashboard/AlertCard.tsx
NEW   src/components/assumptions/DriftDot.tsx
NEW   supabase/migrations/<ts>_alerts.sql       — model_alerts + variance_snapshots + RLS + audit triggers
EDIT  src/pages/Dashboard.tsx                   — mount AlertsPanel, run engine after Generate
EDIT  src/pages/Assumptions.tsx                 — render DriftDot per row
EDIT  src/pages/BankImports.tsx                 — run engine after confirm
EDIT  src/pages/AuditLog.tsx                    — add "Alert" action filter
EDIT  src/lib/exportExcel.ts                    — add Variance sheet
```

### 8. Acceptance

- Sequoia One $737K vs $659K assumption → Warning alert (>5% payroll rule).
- A $4,800 variance on a $40K line does NOT flag (fails ≥$5K).
- A $6,000 variance on a $200K line does NOT flag (fails >10%).
- A $250K Anthropic payment never appears as a one-time alert (known COGS vendor).
- A $250K payment to "Acme Consulting" with no `bank_category_rules` match → Critical one-time alert.
- Apply suggestion writes 2 audit rows linked by `parent_alert_id`; Dismiss writes 1 row with reason JSON; auto-resolve writes 1 row with `Auto-resolved — variance within threshold`.
- Excel export contains 13-Week Forecast, Audit, Variance sheets.

