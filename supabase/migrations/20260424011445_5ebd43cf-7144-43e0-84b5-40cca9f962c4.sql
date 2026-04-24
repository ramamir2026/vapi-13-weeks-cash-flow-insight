-- 1. bank_transactions table (universal across all bank sources)
CREATE TYPE public.bank_source AS ENUM (
  'brex_primary',
  'brex_treasury',
  'brex_stripe_clearing',
  'svb_checking',
  'svb_money_market',
  'stripe'
);

CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  vendor text NOT NULL,
  amount numeric NOT NULL,
  balance numeric,
  category text NOT NULL DEFAULT 'unmatched',
  bank_source public.bank_source NOT NULL,
  source text NOT NULL DEFAULT 'import',
  import_filename text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, vendor, amount, bank_source)
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view bank_transactions"
  ON public.bank_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors can insert bank_transactions"
  ON public.bank_transactions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Editors can update bank_transactions"
  ON public.bank_transactions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Approvers can delete bank_transactions"
  ON public.bank_transactions FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER bank_transactions_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER bank_transactions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE INDEX idx_bank_transactions_date ON public.bank_transactions (date DESC);
CREATE INDEX idx_bank_transactions_source ON public.bank_transactions (bank_source);
CREATE INDEX idx_bank_transactions_category ON public.bank_transactions (category);

-- 2. bank_statements table (monthly statements for balance verification)
CREATE TABLE public.bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_source public.bank_source NOT NULL,
  statement_date date NOT NULL,
  closing_balance numeric NOT NULL,
  filename text NOT NULL,
  parsed_text text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_source, statement_date)
);

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view bank_statements"
  ON public.bank_statements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors can insert bank_statements"
  ON public.bank_statements FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Editors can update bank_statements"
  ON public.bank_statements FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Approvers can delete bank_statements"
  ON public.bank_statements FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER bank_statements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_statements
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- 3. bank_category_rules (vendor-contains rules for auto-categorization)
CREATE TABLE public.bank_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_contains text NOT NULL,
  category text NOT NULL,
  bank_source public.bank_source,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_contains, bank_source)
);

ALTER TABLE public.bank_category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view bank_category_rules"
  ON public.bank_category_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors can manage bank_category_rules"
  ON public.bank_category_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER bank_category_rules_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_category_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- 4. weekly_checklist (per-week Monday close checklist state)
CREATE TABLE public.weekly_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date date NOT NULL,
  item_key text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_by_email text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start_date, item_key)
);

ALTER TABLE public.weekly_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view weekly_checklist"
  ON public.weekly_checklist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors can manage weekly_checklist"
  ON public.weekly_checklist FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER weekly_checklist_updated_at
  BEFORE UPDATE ON public.weekly_checklist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Seed per-account opening cash assumptions
INSERT INTO public.assumptions (category, key, label, value, unit, notes) VALUES
  ('cash', 'cash_brex_primary', 'Brex Primary', 0, 'USD', 'Opening balance — verified against monthly statement'),
  ('cash', 'cash_brex_treasury', 'Brex Treasury', 0, 'USD', 'Opening balance — verified against monthly statement'),
  ('cash', 'cash_brex_stripe_clearing', 'Brex Stripe Clearing', 0, 'USD', 'Opening balance — verified against monthly statement'),
  ('cash', 'cash_svb_checking', 'SVB Analysis Checking', 0, 'USD', 'Opening balance — verified against monthly statement'),
  ('cash', 'cash_svb_money_market', 'SVB Money Market', 0, 'USD', 'Opening balance — verified against monthly statement')
ON CONFLICT (key) DO NOTHING;