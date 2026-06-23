CREATE TABLE public.weekly_report_state (
  week_start_date date PRIMARY KEY,
  finalized boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  finalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  sent_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.weekly_report_state TO authenticated;
GRANT ALL ON public.weekly_report_state TO service_role;

ALTER TABLE public.weekly_report_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read weekly_report_state"
  ON public.weekly_report_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert weekly_report_state"
  ON public.weekly_report_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update weekly_report_state"
  ON public.weekly_report_state FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_weekly_report_state_updated_at
  BEFORE UPDATE ON public.weekly_report_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();