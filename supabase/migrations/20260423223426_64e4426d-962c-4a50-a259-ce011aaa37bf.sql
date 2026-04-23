-- Hire status enum
CREATE TYPE public.hire_status AS ENUM ('confirmed', 'offer_sent', 'interviewing');

-- Add status column with safe default
ALTER TABLE public.future_hires
  ADD COLUMN status public.hire_status NOT NULL DEFAULT 'interviewing';

-- Snapshot table for the payroll-impact totals applied to the forecast
CREATE TABLE public.hire_payroll_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_start date NOT NULL,
  periods jsonb NOT NULL,
  weeks jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hire_payroll_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view hire_payroll_overrides"
  ON public.hire_payroll_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert hire_payroll_overrides"
  ON public.hire_payroll_overrides FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update hire_payroll_overrides"
  ON public.hire_payroll_overrides FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete hire_payroll_overrides"
  ON public.hire_payroll_overrides FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_hire_payroll_overrides_forecast_start
  ON public.hire_payroll_overrides(forecast_start DESC, created_at DESC);