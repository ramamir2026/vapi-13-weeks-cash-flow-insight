-- Create ar_weekly_overrides table for A/R model snapshots
CREATE TABLE IF NOT EXISTS public.ar_weekly_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_start DATE NOT NULL,
    delay_days INTEGER NOT NULL DEFAULT 0,
    weighted BOOLEAN NOT NULL DEFAULT true,
    weeks JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ar_weekly_overrides ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view their own overrides"
ON public.ar_weekly_overrides
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "Users can insert their own overrides"
ON public.ar_weekly_overrides
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own overrides"
ON public.ar_weekly_overrides
FOR UPDATE
TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own overrides"
ON public.ar_weekly_overrides
FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- Create index for efficient latest lookup
CREATE INDEX idx_ar_weekly_overrides_forecast_start 
ON public.ar_weekly_overrides(forecast_start DESC, created_at DESC);