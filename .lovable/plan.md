## Bank Imports CSV — Fix in place

The current upload flow fails because header detection is brittle (requires exact normalized column names that real exports rarely produce), BOM/CRLF aren't stripped, dispatch logic short-circuits when one parser returns zero rows, the page resets after a single import, there's no PDF/XLSX guard, and there's no per-source "transactions on file" panel. Fix all of this **in the existing files** — no new parser files.

### 1. `src/lib/bankParsers/types.ts` — robust shared helpers + expanded categorizer

- Strengthen `parseAmount` so `($1,234.56)`, `-$1,234.56`, `$1,234.56`, and `1234.56` all yield correct signed numbers.
- Strengthen `toIsoDate` to handle `MM/DD/YYYY`, `M/D/YYYY`, `YYYY-MM-DD`, `MMM D YYYY`, `MMM DD, YYYY`, and `D MMM YYYY` (try explicit regex matches before `new Date()` fallback to avoid timezone drift).
- Add a `stripBom` helper and a `normalizeText(text)` that strips UTF-8 BOM and converts CRLF → LF; export it for both detect.ts and the page.
- Replace `autoCategorize` with the full vendor map (lowercase contains): sweep / transfer to / transfer from / brex treasury → `zba_sweep`; sequoia one → `payroll`; stripe payout / stripe transfer → `stripe_revenue`; anthropic / openai / azure / deepgram / elevenlabs / twilio / pump → `cogs`; brex inc → `card_payments`; montgomery / supervisor / creators corner / pianta → `sm`; prizm / execcatalyst / candidate labs → `recruiting`; hogan lovells / cti iii / vat compliance → `legal`; deel → `deel`; navan / 121 silicon → `hre`; true capital / landlord → `rent`; kitchens / anrok / franchise tax / nys dtf / intuit / cbf → `ga`; versaconnect / unityai / reinform / alto pharmacy / monday.com → `ar_collections`; else `unmatched`.

### 2. `src/lib/bankParsers/detect.ts` — header-score detection

Replace the contents with a more forgiving detector:

1. Run `normalizeText` first so BOM/CRLF never break header lookup.
2. Scan the first 20 non-empty lines and score each by how many recognizable header tokens it contains (`date|posting date|posted at|transaction date|initiated date`, `amount|net|gross`, `credit`, `debit`, `description|memo|details|to/from|merchant|payee|counterparty`, `balance|running balance|ending balance`, `status`, `account number last four`). Pick the highest-scoring line with score ≥ 2.
3. Detect source from header tokens + filename:
   - `to/from` OR `account number last four` → Brex; filename `treasury` → `brex_treasury`, `clearing` → `brex_stripe_clearing`, else `brex_primary`.
   - Separate `credit` AND `debit` columns → `svb_money_market`.
   - `description` + `amount` + `balance` (no Brex/credit-debit markers) → `svb_checking`, but if filename hints `stripe` → `stripe`.
   - `description` + `amount` only → `stripe`.
4. Always run the chosen parser even if it returns zero rows (return `low` confidence + warning instead of throwing away the result silently).
5. Return `{ source, confidence, rows, warnings }` with confidence `medium` when filename and header disagree, `low` when fallback path was used.

### 3. `src/lib/bankParsers/brex.ts` — skip Pending/Scheduled

Already skips `pending`. Extend the status check so any of `pending`, `scheduled`, `canceled`, `cancelled`, `failed` are skipped. Also: feed the file through `normalizeText` (or rely on detect.ts having already done so) and tolerate the additional vendor-column aliases (`merchant`, `counterparty`, `payee`) that detect now recognizes.

### 4. `src/lib/bankParsers/{stripe,svbChecking,svbMoneyMarket}.ts` — minor robustness

Each existing parser already follows the same pattern. Add: BOM strip safety at top of each (in case caller passes raw text), tolerate `Posted At`/`Initiated Date` variants for Brex-clearing exports (Stripe), and tolerate `Withdrawal`/`Deposit` aliases already present in SVB MM. No structural rewrite — just header-map additions.

### 5. `src/pages/BankImports.tsx` — working multi-file UI

Replace the Transactions tab body with:

1. **"Transactions on file" status panel** — 6 small cards (one per `BankSource`) at the top. Each shows: bank label, row count, date range (`min(date) – max(date)`), last upload date (`max(created_at)`). If empty → `"Not yet uploaded."` Powered by a new `useBankTransactionStats()` hook in `src/hooks/useBankData.ts` that selects `bank_source, date, created_at` and aggregates client-side.
2. **File-type guard** — before reading: if filename does not end in `.csv` (case-insensitive) → toast `"Please upload a CSV file. For PDFs use the Statements tab."` and bail.
3. **Dropzone** — stays mounted permanently. Drop or click. Calls `file.text()` then `detectAndParse(...)`.
4. **Detection bar** — filename, detected-source dropdown (override allowed), confidence badge, warnings.
5. **Preview table** — date, vendor, amount, category select, confirm checkbox. ZBA sweeps default unconfirmed; unmatched rows highlighted amber. Editing the category auto-confirms the row.
6. **Summary line** — `"X of Y transactions confirmed. Z unmatched need review."` plus per-category totals.
7. **Import button** — uses existing `useImportBankTransactions` upsert (already conflicts on `date,vendor,amount,bank_source` with `ignoreDuplicates`). On success: toast `"Imported N new transactions. M already on file. K unmatched — review below."` Then **only clear the preview state** (`rows`, `filename`, `detectedSource`, `warnings`) — leave the dropzone mounted so the next file can be dropped immediately. Status panel auto-refreshes via query invalidation.
8. Variance/alert detection after import keeps working as it does today.

Also extend `CATEGORY_OPTIONS` / `CATEGORY_LABEL` with the new categories: `sm`, `recruiting`, `legal`, `deel`, `hre`, `ga`.

### 6. `src/hooks/useBankData.ts` — add stats hook

Add `useBankTransactionStats()` that returns `Record<BankSource, { count: number; minDate: string|null; maxDate: string|null; lastUpload: string|null }>`. Single Supabase select limited to needed columns; aggregates client-side. Invalidated by the same key as `bank_transactions` so it refreshes after every import.

### 7. Supabase migration — `bank_transactions` (idempotent)

`bank_transactions` already exists with the right columns and unique constraint on `(date, vendor, amount, bank_source)`. The migration is **defensive only** — wrap everything in `IF NOT EXISTS` so re-applying is a no-op:

```sql
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  vendor text NOT NULL,
  amount numeric NOT NULL,
  balance numeric,
  category text NOT NULL DEFAULT 'unmatched',
  bank_source bank_source NOT NULL,
  source text NOT NULL DEFAULT 'import',
  import_filename text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_natural_key
  ON public.bank_transactions (date, vendor, amount, bank_source);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
-- Re-create RLS + audit trigger only if missing (CREATE POLICY IF NOT EXISTS / DROP+CREATE pattern).
```

No data migration; no changes to existing rows.

### Files touched

- Edit `src/lib/bankParsers/types.ts`
- Edit `src/lib/bankParsers/detect.ts`
- Edit `src/lib/bankParsers/brex.ts`
- Edit `src/lib/bankParsers/stripe.ts`
- Edit `src/lib/bankParsers/svbChecking.ts`
- Edit `src/lib/bankParsers/svbMoneyMarket.ts`
- Edit `src/pages/BankImports.tsx`
- Edit `src/hooks/useBankData.ts`
- New defensive migration under `supabase/migrations/`

No new parser files. No deleted files.

### Acceptance

- Brex Primary CSV with UTF-8 BOM + CRLF parses, detected `brex_primary` high confidence.
- SVB MM CSV with `Credit`/`Debit` columns → `svb_money_market`, amount = credit − debit.
- Stripe CSV with no `Balance` column → `stripe`.
- `($1,234.56)` parses to `-1234.56`; `01/15/2026`, `2026-01-15`, `Jan 15 2026` all → `2026-01-15`.
- Dropping `.pdf` shows the inline error and does not parse.
- After Import, preview clears but dropzone stays mounted — second file can be dropped immediately.
- Status panel updates row counts and date ranges per source.
- Re-uploading the same file imports 0 new rows.
