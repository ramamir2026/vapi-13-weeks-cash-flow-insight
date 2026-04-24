-- model_alerts table
CREATE TABLE public.model_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start_date DATE NOT NULL,
  category TEXT NOT NULL,
  assumption_key TEXT NOT NULL,
  modeled_amount NUMERIC NOT NULL DEFAULT 0,
  actual_amount NUMERIC NOT NULL DEFAULT 0,
  variance_pct NUMERIC NOT NULL DEFAULT 0,
  variance_dollar NUMERIC NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'info',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT,
  detail TEXT,
  suggested_value NUMERIC,
  dismissal_reason TEXT,
  dismissed_by TEXT,
  dismissed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  auto_resolved BOOLEAN NOT NULL DEFAULT false,
  parent_alert_id UUID REFERENCES public.model_alerts(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT model_alerts_severity_check CHECK (severity IN ('info','warning','critical')),
  CONSTRAINT model_alerts_status_check CHECK (status IN ('open','dismissed','resolved'))
);

CREATE UNIQUE INDEX model_alerts_unique_open
  ON public.model_alerts (week_start_date, assumption_key, category)
  WHERE status = 'open';

CREATE INDEX model_alerts_status_idx ON public.model_alerts (status, week_start_date DESC);

ALTER TABLE public.model_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view model_alerts"
  ON public.model_alerts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Editors can insert model_alerts"
  ON public.model_alerts FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Editors can update model_alerts"
  ON public.model_alerts FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Approvers can delete model_alerts"
  ON public.model_alerts FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER update_model_alerts_updated_at
  BEFORE UPDATE ON public.model_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_model_alerts
  AFTER INSERT OR UPDATE OR DELETE ON public.model_alerts
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- variance_snapshots table
CREATE TABLE public.variance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start_date DATE NOT NULL,
  assumption_key TEXT NOT NULL,
  category TEXT,
  modeled NUMERIC NOT NULL DEFAULT 0,
  actual NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX variance_snapshots_unique
  ON public.variance_snapshots (week_start_date, assumption_key);

CREATE INDEX variance_snapshots_key_idx
  ON public.variance_snapshots (assumption_key, week_start_date DESC);

ALTER TABLE public.variance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view variance_snapshots"
  ON public.variance_snapshots FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Editors can insert variance_snapshots"
  ON public.variance_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Editors can update variance_snapshots"
  ON public.variance_snapshots FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Approvers can delete variance_snapshots"
  ON public.variance_snapshots FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );