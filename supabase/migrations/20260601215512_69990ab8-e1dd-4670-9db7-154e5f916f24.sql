ALTER TYPE public.bank_source ADD VALUE IF NOT EXISTS 'svb_collateral';

INSERT INTO public.assumptions (category, key, label, value, unit, notes)
VALUES ('cash', 'cash_svb_collateral_restricted', 'SVB Collateral MMA (restricted)', 0, 'USD', 'Restricted collateral — NOT spendable, excluded from opening cash')
ON CONFLICT DO NOTHING;