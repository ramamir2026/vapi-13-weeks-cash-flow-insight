CREATE TABLE public.ap_weekly_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_start DATE NOT NULL,
  weeks_by_vendor JSONB NOT NULL,
  weeks_total JSONB NOT NULL,
  import_filename TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ap_weekly_overrides TO authenticated;
GRANT ALL ON public.ap_weekly_overrides TO service_role;

ALTER TABLE public.ap_weekly_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AP overrides"
  ON public.ap_weekly_overrides FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert their own AP overrides"
  ON public.ap_weekly_overrides FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own AP overrides"
  ON public.ap_weekly_overrides FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own AP overrides"
  ON public.ap_weekly_overrides FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE INDEX idx_ap_weekly_overrides_forecast_start
  ON public.ap_weekly_overrides (forecast_start DESC, created_at DESC);