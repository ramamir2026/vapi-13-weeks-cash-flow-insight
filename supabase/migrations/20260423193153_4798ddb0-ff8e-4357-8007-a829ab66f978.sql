-- Reseed assumptions with the corrected key set for the 13-week forecast engine
-- Remove obsolete keys
DELETE FROM public.assumptions WHERE key IN (
  'stripe_weekly_revenue',
  'stripe_growth_rate_weekly',
  'enterprise_monthly_ach',
  'biweekly_payroll',
  'monthly_rent',
  'monthly_opex',
  'monthly_card_payments',
  'cogs_pct_of_revenue',
  'payroll_taxes_pct',
  'opex_rent'
);

-- Upsert the new key set. Use ON CONFLICT on key to keep idempotent.
-- Add a unique constraint on key if it does not exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assumptions_key_unique'
  ) THEN
    ALTER TABLE public.assumptions ADD CONSTRAINT assumptions_key_unique UNIQUE (key);
  END IF;
END $$;

INSERT INTO public.assumptions (category, key, label, value, unit, notes) VALUES
  -- Cash
  ('Cash', 'opening_cash_balance', 'Opening Cash Balance', 50000000, 'USD', 'Starting cash for week 1'),
  ('Cash', 'min_cash_threshold', 'Minimum Cash Threshold', 15000000, 'USD', 'Floor for headroom analytics'),
  -- Revenue
  ('Revenue', 'stripe_daily_rate', 'Stripe Daily Rate', 250000, 'USD/day', 'Avg daily Stripe revenue (5 business days/week)'),
  ('Revenue', 'stripe_growth_pct', 'Stripe Monthly Growth %', 8, '%', 'Compounded monthly'),
  ('Revenue', 'enterprise_ach_weekly', 'Enterprise ACH (Weekly)', 200000, 'USD/wk', 'Weekly enterprise ACH inflow'),
  -- A/R
  ('A/R', 'ar_delay_days', 'A/R Collection Delay', 7, 'days', 'Shift expected dates forward by this many days'),
  -- Payroll
  ('Payroll', 'payroll_semi_monthly', 'Semi-Monthly Payroll', 659000, 'USD', 'Total employer cost per pay period (already loaded)'),
  -- COGS (monthly $)
  ('COGS', 'cogs_anthropic', 'Anthropic (Monthly)', 850000, 'USD/mo', 'Drops on W2, W7, W11'),
  ('COGS', 'cogs_azure', 'Azure (Monthly)', 420000, 'USD/mo', 'Drops on W3, W8, W12'),
  ('COGS', 'cogs_openai', 'OpenAI (Monthly)', 380000, 'USD/mo', 'Drops on W2, W7, W11'),
  ('COGS', 'cogs_elevenlabs', 'ElevenLabs (Monthly)', 95000, 'USD/mo', 'Drops on W3, W8, W12'),
  ('COGS', 'cogs_deepgram', 'Deepgram (One-time W2)', 120000, 'USD', 'Single payment on W2'),
  ('COGS', 'cogs_pump_aws', 'Pump/AWS (Monthly)', 165000, 'USD/mo', 'Drops on W4, W9, W13'),
  ('COGS', 'cogs_twilio', 'Twilio (Monthly)', 75000, 'USD/mo', 'Drops on W3, W8, W12'),
  ('COGS', 'cogs_other', 'Other COGS (Monthly)', 60000, 'USD/mo', 'Smoothed across every week (÷ 4.333)'),
  -- OpEx (monthly $)
  ('OpEx', 'opex_sm', 'Sales & Marketing', 180000, 'USD/mo', 'Smoothed weekly'),
  ('OpEx', 'opex_software', 'Software', 95000, 'USD/mo', 'Smoothed weekly'),
  ('OpEx', 'opex_legal', 'Legal', 55000, 'USD/mo', 'Smoothed weekly'),
  ('OpEx', 'opex_deel', 'Deel (Contractors)', 140000, 'USD/mo', 'Smoothed weekly'),
  ('OpEx', 'opex_hr_te', 'HR / T&E', 65000, 'USD/mo', 'Smoothed weekly'),
  ('OpEx', 'opex_recruiting', 'Recruiting', 80000, 'USD/mo', 'Smoothed weekly'),
  ('OpEx', 'opex_ga', 'G&A', 70000, 'USD/mo', 'Smoothed weekly + W2 one-time'),
  ('OpEx', 'one_time_w2', 'G&A One-Time (W2)', 25000, 'USD', 'Added to G&A on week 2 only'),
  -- Rent (two regimes)
  ('Rent', 'rent_may_sep', 'Rent (May–Sep, Monthly)', 32417, 'USD/mo', 'Active months May through September'),
  ('Rent', 'rent_oct_plus', 'Rent (Oct+, Monthly)', 64835, 'USD/mo', 'Active months October onward')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  unit = EXCLUDED.unit,
  notes = EXCLUDED.notes;
-- Note: ON CONFLICT does NOT update value, so existing values are preserved.
