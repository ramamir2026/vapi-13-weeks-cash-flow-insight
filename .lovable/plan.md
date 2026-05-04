Update timing constants in both forecast files (`src/lib/forecast.ts` and `supabase/functions/_shared/forecast.ts`) — no other edits.

### Changes (applied identically to both files)

1. **COGS_VENDOR_WEEKS** — replace contents:
```ts
const COGS_VENDOR_WEEKS: Record<string, number[]> = {
  cogs_anthropic:  [5, 9],
  cogs_azure:      [1, 5, 10],
  cogs_openai:     [1, 5, 9],
  cogs_elevenlabs: [1, 6, 10],
  cogs_deepgram:   [],
  cogs_pump_aws:   [3, 7, 11],
  cogs_twilio:     [4, 8, 12],
};
```

2. **PAYROLL_WEEKS**:
```ts
const PAYROLL_WEEKS = new Set([2, 4, 6, 8, 11, 13]);
```

3. **brexByWeek** (inside `buildForecast`):
```ts
const brexByWeek: Record<number, number> = {
  5: assumptions["brex_w2"] ?? 0,
  9: assumptions["brex_w7"] ?? 0,
};
```
(Note: `brex_w11` key is dropped from the lookup.)

4. **rentPaymentIndices**:
```ts
const rentPaymentIndices = [4, 8];
```

### Files
- `src/lib/forecast.ts`
- `supabase/functions/_shared/forecast.ts` (mirror — same constants present)

No other logic, types, UI, or exports change.
