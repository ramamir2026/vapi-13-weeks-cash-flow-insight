import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============ Roles ============
export type AppRole = "viewer" | "editor" | "approver" | "admin" | "user";
export type EffectiveRole = "viewer" | "editor" | "approver";

const collapseRole = (r: AppRole | null | undefined): EffectiveRole => {
  if (r === "approver" || r === "admin") return "approver";
  if (r === "editor" || r === "user") return "editor";
  return "viewer";
};

export const useCurrentRole = () =>
  useQuery({
    queryKey: ["current_user_role"],
    queryFn: async (): Promise<EffectiveRole> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return "viewer";
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      if (error) throw error;
      const roles = (data ?? []).map((r) => r.role as AppRole);
      // Highest precedence: approver > admin > editor > user > viewer
      const order: AppRole[] = ["approver", "admin", "editor", "user", "viewer"];
      const top = order.find((o) => roles.includes(o)) ?? "viewer";
      return collapseRole(top);
    },
  });

export const useIsApprover = () => {
  const { data } = useCurrentRole();
  return data === "approver";
};

export const useIsEditorOrAbove = () => {
  const { data } = useCurrentRole();
  return data === "editor" || data === "approver";
};

// ============ Week Sign-offs ============
export type WeekSignoff = {
  id: string;
  week_start_date: string;
  approved_by_email: string;
  approved_by_user_id: string;
  approved_at: string;
  note: string | null;
};

export const useWeekSignoffs = () =>
  useQuery({
    queryKey: ["week_signoffs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("week_signoffs")
        .select("*")
        .order("week_start_date");
      if (error) throw error;
      return (data ?? []) as WeekSignoff[];
    },
  });

export const useSignOffWeek = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekStartDate: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const email = u.user.email ?? "unknown";
      const { error } = await supabase.from("week_signoffs").insert({
        week_start_date: weekStartDate,
        approved_by_email: email,
        approved_by_user_id: u.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["week_signoffs"] });
      toast.success("Week signed off");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUnsignWeek = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekStartDate: string) => {
      const { error } = await supabase
        .from("week_signoffs")
        .delete()
        .eq("week_start_date", weekStartDate);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["week_signoffs"] });
      toast.success("Sign-off removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Audit Log ============
export type AuditEntry = {
  id: string;
  user_email: string | null;
  user_id: string | null;
  action: string;
  table_name: string;
  row_id: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  source: string;
  import_filename: string | null;
  created_at: string;
};

export type AuditFilters = {
  user?: string;
  table?: string[];
  action?: string[];
  startDate?: string; // ISO date
  endDate?: string;
  page?: number;
  pageSize?: number;
};

export const useAuditLog = (filters: AuditFilters = {}) =>
  useQuery({
    queryKey: ["audit_log", filters],
    queryFn: async () => {
      const pageSize = filters.pageSize ?? 50;
      const page = filters.page ?? 0;
      let q = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (filters.user) q = q.eq("user_email", filters.user);
      if (filters.table?.length) q = q.in("table_name", filters.table);
      if (filters.action?.length) q = q.in("action", filters.action);
      if (filters.startDate) q = q.gte("created_at", filters.startDate);
      if (filters.endDate) q = q.lte("created_at", filters.endDate);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as AuditEntry[], total: count ?? 0 };
    },
  });

// Distinct emails for filter combobox
export const useAuditUsers = () =>
  useQuery({
    queryKey: ["audit_log_users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("user_email")
        .not("user_email", "is", null)
        .limit(1000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.user_email).filter(Boolean))) as string[];
    },
  });

// ============ Override import lock (approver only) ============
export const useOverrideImportLock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, rowId }: { table: "ar_entries" | "future_hires" | "weekly_actuals"; rowId: string }) => {
      const { error } = await supabase.rpc("clear_import_lock", {
        p_table: table,
        p_row: rowId,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [vars.table] });
      qc.invalidateQueries({ queryKey: ["ar_entries"] });
      qc.invalidateQueries({ queryKey: ["future_hires"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success("Override applied — row unlocked");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Tag the next set of inserts as an import ============
export const setImportContext = async (filename: string) => {
  await supabase.rpc("set_import_context", { filename });
};
