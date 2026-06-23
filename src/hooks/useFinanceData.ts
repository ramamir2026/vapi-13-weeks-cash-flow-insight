import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCurrentMondayKey, getPriorMondayKey } from "@/lib/weekKey";

// ============ Assumptions ============
export type Assumption = {
  id: string;
  category: string;
  key: string;
  label: string;
  value: number;
  unit: string | null;
  notes: string | null;
};

export const useAssumptions = () =>
  useQuery({
    queryKey: ["assumptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assumptions")
        .select("*")
        .order("category")
        .order("label");
      if (error) throw error;
      return (data ?? []) as Assumption[];
    },
  });

export const useUpdateAssumption = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await supabase.from("assumptions").update({ value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assumptions"] });
      toast.success("Assumption updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ A/R entries ============
export type ArEntry = {
  id: string;
  customer_name: string;
  invoice_number: string | null;
  invoice_amount: number;
  invoice_date: string;
  expected_collection_date: string;
  status: "pending" | "collected" | "overdue" | "written_off";
  notes: string | null;
  source?: string;
  import_filename?: string | null;
  import_locked?: boolean;
};

export const useArEntries = () =>
  useQuery({
    queryKey: ["ar_entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ar_entries")
        .select("*")
        .order("expected_collection_date");
      if (error) throw error;
      return (data ?? []) as ArEntry[];
    },
  });

export const useUpsertArEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Partial<ArEntry> & { id?: string }) => {
      if (entry.id) {
        const { id, ...rest } = entry;
        const { error } = await supabase.from("ar_entries").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ar_entries").insert(entry as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ar_entries"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteArEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ar_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ar_entries"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Future hires ============
export type HireStatus = "confirmed" | "offer_sent" | "interviewing";

export type FutureHire = {
  id: string;
  name: string;
  role: string;
  department: string | null;
  start_date: string;
  annual_salary: number;
  status: HireStatus;
  notes: string | null;
  source?: string;
  import_filename?: string | null;
  import_locked?: boolean;
};

export const useFutureHires = () =>
  useQuery({
    queryKey: ["future_hires"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("future_hires")
        .select("*")
        .order("start_date");
      if (error) throw error;
      return (data ?? []) as FutureHire[];
    },
  });

export const useUpsertHire = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hire: Partial<FutureHire> & { id?: string }) => {
      if (hire.id) {
        const { id, ...rest } = hire;
        const { error } = await supabase.from("future_hires").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("future_hires").insert(hire as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["future_hires"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteHire = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("future_hires").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["future_hires"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ A/R weekly overrides ============
export type ArWeeklyOverride = {
  id: string;
  forecast_start: string;
  delay_days: number;
  weeks: number[];
  created_at: string;
};
const currentForecastStartISO = () => getCurrentMondayKey();

export const useArWeeklyOverride = () =>
  useQuery({
    queryKey: ["ar_weekly_overrides", currentForecastStartISO()],
    queryFn: async () => {
      const start = currentForecastStartISO();
      const { data, error } = await supabase
        .from("ar_weekly_overrides")
        .select("*")
        .eq("forecast_start", start)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        forecast_start: data.forecast_start,
        delay_days: data.delay_days,
        weeks: (data.weeks as unknown as number[]) ?? new Array(13).fill(0),
        created_at: data.created_at,
      } as ArWeeklyOverride;
    },
  });

export const useApplyArOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weeks, delayDays }: { weeks: number[]; delayDays: number }) => {
      const start = currentForecastStartISO();
      const { error } = await supabase.from("ar_weekly_overrides").insert({
        forecast_start: start,
        delay_days: delayDays,
        weeks: weeks as any,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ar_weekly_overrides"] });
      qc.invalidateQueries({ queryKey: ["ar_entries"] });
      toast.success("Applied to model");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Hire payroll overrides ============
export type HirePayrollOverride = {
  id: string;
  forecast_start: string;
  weeks: number[];
  periods: Array<{ key: string; total: number }>;
  created_at: string;
};

export const useHirePayrollOverride = () =>
  useQuery({
    queryKey: ["hire_payroll_overrides", currentForecastStartISO()],
    queryFn: async () => {
      const start = currentForecastStartISO();
      const { data, error } = await supabase
        .from("hire_payroll_overrides")
        .select("*")
        .eq("forecast_start", start)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        forecast_start: data.forecast_start,
        weeks: (data.weeks as unknown as number[]) ?? new Array(13).fill(0),
        periods: (data.periods as unknown as Array<{ key: string; total: number }>) ?? [],
        created_at: data.created_at,
      } as HirePayrollOverride;
    },
  });

export const useApplyHirePayrollOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      weeks,
      periods,
    }: {
      weeks: number[];
      periods: Array<{ key: string; total: number }>;
    }) => {
      const start = currentForecastStartISO();
      const { error } = await supabase.from("hire_payroll_overrides").insert({
        forecast_start: start,
        weeks: weeks as any,
        periods: periods as any,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hire_payroll_overrides"] });
      toast.success("Payroll impact applied to model");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ AP weekly overrides ============
export type ApWeeklyOverride = {
  id: string;
  forecast_start: string;
  weeks_by_vendor: Record<string, number[]>;
  weeks_total: number[];
  import_filename: string | null;
  created_at: string;
};

export const useApWeeklyOverride = () =>
  useQuery({
    queryKey: ["ap_weekly_overrides", currentForecastStartISO()],
    queryFn: async () => {
      const start = currentForecastStartISO();
      const { data, error } = await supabase
        .from("ap_weekly_overrides" as any)
        .select("*")
        .eq("forecast_start", start)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as any;
      return {
        id: row.id,
        forecast_start: row.forecast_start,
        weeks_by_vendor: (row.weeks_by_vendor ?? {}) as Record<string, number[]>,
        weeks_total: (row.weeks_total ?? new Array(5).fill(0)) as number[],
        import_filename: row.import_filename ?? null,
        created_at: row.created_at,
      } as ApWeeklyOverride;
    },
  });

export const useApplyApOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      weeksByVendor,
      weeksTotal,
      importFilename,
    }: {
      weeksByVendor: Record<string, number[]>;
      weeksTotal: number[];
      importFilename?: string | null;
    }) => {
      const start = currentForecastStartISO();
      const { error } = await supabase.from("ap_weekly_overrides" as any).insert({
        forecast_start: start,
        weeks_by_vendor: weeksByVendor as any,
        weeks_total: weeksTotal as any,
        import_filename: importFilename ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ap_weekly_overrides"] });
      toast.success("A/P bills applied to model");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};


// ============ Forecast snapshot ============
export type ForecastSnapshotWeek = {
  week_index: number;
  week_start_date: string;
  opening_balance: number;
  stripe_revenue: number;
  enterprise_revenue: number;
  ar_collections: number;
  payroll: number;
  cogs: number;
  card_payments: number;
  rent: number;
  opex: number;
  net_change: number;
  closing_balance: number;
  burn: number;
  runway_weeks: number | null;
};

export const useSaveForecastSnapshot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weeks: ForecastSnapshotWeek[]) => {
      const snapshotId = crypto.randomUUID();
      const label = `Snapshot ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
      const rows = weeks.map((w) => ({
        ...w,
        snapshot_id: snapshotId,
        snapshot_label: label,
      }));
      const { error } = await supabase.from("model_weeks").insert(rows as any);
      if (error) throw error;
      return snapshotId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["model_weeks"] });
      toast.success("Forecast snapshot saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// Most recent forecast snapshot timestamp — used to decide if the model is stale.
export const useLatestForecastAt = () =>
  useQuery({
    queryKey: ["model_weeks", "latest_created_at"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_weeks")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.created_at ? new Date(data.created_at) : null;
    },
  });

// ============ Weekly actuals (prior-week column on dashboard) ============
// We store the per-row actuals as JSON in weekly_actuals.notes for the prior week.
const priorWeekStartISO = () => getPriorMondayKey();

export const useWeeklyActuals = () =>
  useQuery({
    queryKey: ["weekly_actuals_prior"],
    queryFn: async () => {
      const wk = priorWeekStartISO();
      const { data, error } = await supabase
        .from("weekly_actuals")
        .select("*")
        .eq("week_start_date", wk)
        .maybeSingle();
      if (error) throw error;
      let map: Record<string, number> = {};
      if (data?.notes) {
        try {
          map = JSON.parse(data.notes);
        } catch {
          map = {};
        }
      }
      return { weekStart: wk, closing: Number(data?.closing_cash_balance ?? 0), map };
    },
  });

export const useUpdateWeeklyActual = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rowKey, value }: { rowKey: string; value: number }) => {
      const wk = priorWeekStartISO();
      const { data: existing } = await supabase
        .from("weekly_actuals")
        .select("*")
        .eq("week_start_date", wk)
        .maybeSingle();
      let map: Record<string, number> = {};
      if (existing?.notes) {
        try {
          map = JSON.parse(existing.notes);
        } catch {
          map = {};
        }
      }
      map[rowKey] = value;
      if (existing) {
        const { error } = await supabase
          .from("weekly_actuals")
          .update({ notes: JSON.stringify(map), closing_cash_balance: map.closingBalance ?? existing.closing_cash_balance })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("weekly_actuals").insert({
          week_start_date: wk,
          notes: JSON.stringify(map),
          closing_cash_balance: map.closingBalance ?? 0,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly_actuals_prior"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Weekly report finalize state ============
export type WeeklyReportState = {
  week_start_date: string;
  finalized: boolean;
  finalized_at: string | null;
  finalized_by: string | null;
  sent_at: string | null;
  sent_via: string | null;
};

export const useWeeklyReportState = () =>
  useQuery({
    queryKey: ["weekly_report_state", getCurrentMondayKey()],
    queryFn: async () => {
      const wk = getCurrentMondayKey();
      const { data, error } = await supabase
        .from("weekly_report_state" as any)
        .select("*")
        .eq("week_start_date", wk)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as WeeklyReportState | null;
    },
  });

export const useFinalizeAndSendWeeklyReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const wk = getCurrentMondayKey();
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      const { error: upsertErr } = await supabase
        .from("weekly_report_state" as any)
        .upsert(
          {
            week_start_date: wk,
            finalized: true,
            finalized_at: new Date().toISOString(),
            finalized_by: userId,
          } as any,
          { onConflict: "week_start_date" },
        );
      if (upsertErr) throw upsertErr;

      const { data, error } = await supabase.functions.invoke("weekly-report", {
        body: { force: true },
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        delivered_via?: string;
        skipped?: boolean;
        reason?: string;
        error?: string;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["weekly_report_state"] });
      if (data?.skipped) {
        toast.message(`Report skipped: ${data.reason ?? "unknown"}`);
      } else if (data?.ok) {
        toast.success(`Report sent via ${data.delivered_via ?? "slack"}`);
      } else {
        toast.error(data?.error ?? "Send failed");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
