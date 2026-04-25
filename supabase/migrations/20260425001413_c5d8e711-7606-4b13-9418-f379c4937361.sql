CREATE TABLE public.ai_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  week_start_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'monday_auto',
  analysis_text TEXT NOT NULL,
  is_fallback BOOLEAN NOT NULL DEFAULT false,
  generated_by UUID
);

CREATE INDEX idx_ai_analyses_generated_at ON public.ai_analyses (generated_at DESC);
CREATE INDEX idx_ai_analyses_week ON public.ai_analyses (week_start_date DESC);

ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ai_analyses"
  ON public.ai_analyses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Editors can insert ai_analyses"
  ON public.ai_analyses FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Approvers can delete ai_analyses"
  ON public.ai_analyses FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );