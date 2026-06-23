INSERT INTO public.assumptions (category, key, label, value, unit, notes) VALUES
  ('Opening Cash', 'mm_anchor_date',    'SVB MM anchor date (YYYYMMDD)', 0, NULL, 'Known EOD date for the MM anchor balance, as YYYYMMDD (e.g. 20260605). Leave 0 to disable.'),
  ('Opening Cash', 'mm_anchor_balance', 'SVB MM anchor balance',         0, '$',  'EOD MM balance as of mm_anchor_date. Used to derive per-row balances from the sweep CSV.')
ON CONFLICT (key) DO NOTHING;