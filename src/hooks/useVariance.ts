import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ModelWeekRow = {
  id: string;
  snapshot_id: string;
  snapshot_label: string | null;
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

/** Latest forecast snapshot's weeks (most recent created_at). */
export const useLatestSnapshotWeeks = () =>
  useQuery({
    queryKey: ["model_weeks", "latest_snapshot"],
    queryFn: async () => {
      // Pick the most recent snapshot_id by created_at.
      const { data: latest, error: e1 } = await supabase
        .from("model_weeks")
        .select("snapshot_id, snapshot_label, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      if (!latest?.snapshot_id) return { snapshotId: null, label: null, weeks: [] as ModelWeekRow[] };
      const { data, error } = await supabase
        .from("model_weeks")
        .select("*")
        .eq("snapshot_id", latest.snapshot_id)
        .order("week_start_date");
      if (error) throw error;
      return {
        snapshotId: latest.snapshot_id,
        label: latest.snapshot_label,
        weeks: (data ?? []) as ModelWeekRow[],
      };
    },
  });

export type WeeklyActualRow = {
  id: string;
  week_start_date: string;
  closing_cash_balance: number;
  notes: string | null;
  /** Parsed line-item map from the notes JSON. */
  lineMap: Record<string, number>;
};

/** All weekly_actuals rows with their per-line-item JSON parsed out of notes. */
export const useAllWeeklyActuals = () =>
  useQuery({
    queryKey: ["weekly_actuals", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_actuals")
        .select("id, week_start_date, closing_cash_balance, notes")
        .order("week_start_date");
      if (error) throw error;
      return (data ?? []).map((r): WeeklyActualRow => {
        let map: Record<string, number> = {};
        if (r.notes) {
          try {
            const parsed = JSON.parse(r.notes);
            if (parsed && typeof parsed === "object") {
              for (const k of Object.keys(parsed)) {
                const v = Number((parsed as any)[k]);
                if (Number.isFinite(v)) map[k] = v;
              }
            }
          } catch {
            map = {};
          }
        }
        return {
          id: r.id,
          week_start_date: r.week_start_date,
          closing_cash_balance: Number(r.closing_cash_balance ?? 0),
          notes: r.notes,
          lineMap: map,
        };
      });
    },
  });
