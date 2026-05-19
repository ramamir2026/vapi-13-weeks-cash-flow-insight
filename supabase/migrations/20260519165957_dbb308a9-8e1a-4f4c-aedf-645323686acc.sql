ALTER TYPE public.bank_source ADD VALUE IF NOT EXISTS 'ramp_checking';
ALTER TYPE public.bank_source ADD VALUE IF NOT EXISTS 'ramp_treasury';

INSERT INTO public.assumptions (key, value, label, category, unit)
VALUES
  ('cash_ramp_checking', 0, 'Ramp Checking opening balance', 'cash', 'usd'),
  ('cash_ramp_treasury', 0, 'Ramp Treasury opening balance', 'cash', 'usd')
ON CONFLICT (key) DO NOTHING;