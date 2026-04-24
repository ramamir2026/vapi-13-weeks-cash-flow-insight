-- ===== 1. Helper: current user role (highest precedence) =====
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role
    WHEN 'approver' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'editor' THEN 3
    WHEN 'user' THEN 4
    WHEN 'viewer' THEN 5
  END
  LIMIT 1
$$;

-- ===== 2. AUDIT LOG TABLE (append-only) =====
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text,
  user_id uuid,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id uuid,
  field_name text,
  old_value text,
  new_value text,
  source text NOT NULL DEFAULT 'manual',
  import_filename text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_row ON public.audit_log(table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_email ON public.audit_log(user_email);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read; nobody can insert/update/delete directly.
CREATE POLICY "Authenticated users can view audit_log"
  ON public.audit_log FOR SELECT TO authenticated USING (true);

-- Explicit no-op denies (no INSERT/UPDATE/DELETE policies = denied by default with RLS on).

-- ===== 3. WEEK SIGN-OFFS =====
CREATE TABLE IF NOT EXISTS public.week_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date date NOT NULL UNIQUE,
  approved_by_email text NOT NULL,
  approved_by_user_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE public.week_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view week_signoffs"
  ON public.week_signoffs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Approvers can sign off weeks"
  ON public.week_signoffs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'approver'));

CREATE POLICY "Approvers can remove sign-offs"
  ON public.week_signoffs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'approver'));

-- ===== 4. IMPORT METADATA on row tables =====
ALTER TABLE public.ar_entries
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS import_filename text,
  ADD COLUMN IF NOT EXISTS import_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.future_hires
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS import_filename text,
  ADD COLUMN IF NOT EXISTS import_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.weekly_actuals
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS import_filename text,
  ADD COLUMN IF NOT EXISTS import_locked boolean NOT NULL DEFAULT false;

-- ===== 5. set_import_context RPC: marks the current txn as an import =====
CREATE OR REPLACE FUNCTION public.set_import_context(filename text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.source', 'import', true);
  PERFORM set_config('app.import_filename', COALESCE(filename, ''), true);
END;
$$;

-- ===== 6. clear_import_lock: approver-only override =====
CREATE OR REPLACE FUNCTION public.clear_import_lock(p_table text, p_row uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'approver') THEN
    RAISE EXCEPTION 'Only approvers can clear import locks';
  END IF;

  PERFORM set_config('app.source', 'approver_override', true);

  IF p_table = 'ar_entries' THEN
    UPDATE public.ar_entries SET import_locked = false, source = 'approver_override' WHERE id = p_row;
  ELSIF p_table = 'future_hires' THEN
    UPDATE public.future_hires SET import_locked = false, source = 'approver_override' WHERE id = p_row;
  ELSIF p_table = 'weekly_actuals' THEN
    UPDATE public.weekly_actuals SET import_locked = false, source = 'approver_override' WHERE id = p_row;
  ELSE
    RAISE EXCEPTION 'Unsupported table: %', p_table;
  END IF;
END;
$$;

-- ===== 7. AUDIT TRIGGER FUNCTION =====
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_user_id uuid;
  v_source text;
  v_filename text;
  v_old_json jsonb;
  v_new_json jsonb;
  v_key text;
  v_old_val text;
  v_new_val text;
  v_row_id uuid;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_user_id LIMIT 1;
  IF v_email IS NULL THEN
    v_email := COALESCE(current_setting('request.jwt.claim.email', true), 'system');
  END IF;
  v_source := COALESCE(NULLIF(current_setting('app.source', true), ''), 'manual');
  v_filename := NULLIF(current_setting('app.import_filename', true), '');

  IF TG_OP = 'INSERT' THEN
    v_row_id := (to_jsonb(NEW)->>'id')::uuid;
    INSERT INTO public.audit_log (user_email, user_id, action, table_name, row_id, source, import_filename, new_value)
    VALUES (v_email, v_user_id,
      CASE WHEN v_source = 'import' THEN 'import' ELSE 'insert' END,
      TG_TABLE_NAME, v_row_id, v_source, v_filename, to_jsonb(NEW)::text);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_row_id := (to_jsonb(NEW)->>'id')::uuid;
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_new_json) LOOP
      IF v_key IN ('updated_at','created_at') THEN CONTINUE; END IF;
      v_old_val := v_old_json->>v_key;
      v_new_val := v_new_json->>v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        INSERT INTO public.audit_log (user_email, user_id, action, table_name, row_id, field_name, old_value, new_value, source, import_filename)
        VALUES (v_email, v_user_id,
          CASE WHEN v_source = 'approver_override' THEN 'override' ELSE 'update' END,
          TG_TABLE_NAME, v_row_id, v_key, v_old_val, v_new_val, v_source, v_filename);
      END IF;
    END LOOP;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_row_id := (to_jsonb(OLD)->>'id')::uuid;
    INSERT INTO public.audit_log (user_email, user_id, action, table_name, row_id, source, import_filename, old_value)
    VALUES (v_email, v_user_id, 'delete', TG_TABLE_NAME, v_row_id, v_source, v_filename, to_jsonb(OLD)::text);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ===== 8. ATTACH TRIGGERS =====
DROP TRIGGER IF EXISTS audit_assumptions ON public.assumptions;
CREATE TRIGGER audit_assumptions AFTER INSERT OR UPDATE OR DELETE ON public.assumptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_ar_entries ON public.ar_entries;
CREATE TRIGGER audit_ar_entries AFTER INSERT OR UPDATE OR DELETE ON public.ar_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_future_hires ON public.future_hires;
CREATE TRIGGER audit_future_hires AFTER INSERT OR UPDATE OR DELETE ON public.future_hires
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_weekly_actuals ON public.weekly_actuals;
CREATE TRIGGER audit_weekly_actuals AFTER INSERT OR UPDATE OR DELETE ON public.weekly_actuals
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_model_weeks ON public.model_weeks;
CREATE TRIGGER audit_model_weeks AFTER INSERT OR UPDATE OR DELETE ON public.model_weeks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ===== 9. SEED ROLES =====
-- Convert existing 'user' rows to 'editor'
UPDATE public.user_roles SET role = 'editor' WHERE role = 'user';

-- Make ram@vapi.ai an approver (if profile exists)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'approver'::public.app_role
FROM public.profiles
WHERE email = 'ram@vapi.ai'
ON CONFLICT DO NOTHING;

-- Update handle_new_user to default to 'editor' instead of 'user'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'editor')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;