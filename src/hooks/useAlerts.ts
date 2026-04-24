import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AlertCandidate, SnapshotRow } from "@/lib/variance";

export type ModelAlert = {
  id: string;
  week_start_date: string;
  category: string;
  assumption_key: string;
  modeled_amount: number;
  actual_amount: number;
  variance_pct: number;
  variance_dollar: number;
  severity: "info" | "warning" | "critical";
  status: "open" | "dismissed" | "resolved";
  title: string | null;
  detail: string | null;
  suggested_value: number | null;
  dismissal_reason: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  resolved_at: string | null;
  auto_resolved: boolean;
  parent_alert_id: string | null;
  created_at: string;
};

export const useOpenAlerts = () =>
  useQuery({
    queryKey: ["model_alerts", "open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_alerts")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ModelAlert[];
    },
  });

export const useDismissedAlerts = () =>
  useQuery({
    queryKey: ["model_alerts", "dismissed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_alerts")
        .select("*")
        .in("status", ["dismissed", "resolved"])
        .order("dismissed_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ModelAlert[];
    },
  });

export const useDismissAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("model_alerts")
        .update({
          status: "dismissed",
          dismissal_reason: reason,
          dismissed_by: u.user?.email ?? null,
          dismissed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["model_alerts"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success("Alert dismissed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useResolveAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, parentId }: { id: string; parentId?: string }) => {
      const { error } = await supabase
        .from("model_alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          parent_alert_id: parentId ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["model_alerts"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
    },
  });
};

export const useReopenAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("model_alerts")
        .update({
          status: "open",
          dismissed_by: null,
          dismissed_at: null,
          dismissal_reason: null,
          resolved_at: null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["model_alerts"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success("Alert reopened");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Apply suggestion: update assumption, then mark alert resolved; both audit rows linked by parent_alert_id. */
export const useApplyAlertSuggestion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      alertId,
      assumptionKey,
      newValue,
    }: {
      alertId: string;
      assumptionKey: string;
      newValue: number;
    }) => {
      // 1. Update the assumption (writes its own audit row)
      const { data: assumption, error: aErr } = await supabase
        .from("assumptions")
        .select("id")
        .eq("key", assumptionKey)
        .maybeSingle();
      if (aErr) throw aErr;
      if (assumption) {
        const { error: uErr } = await supabase
          .from("assumptions")
          .update({ value: newValue })
          .eq("id", assumption.id);
        if (uErr) throw uErr;
      }
      // 2. Resolve the alert (writes another audit row, linked via parent_alert_id)
      const { error: rErr } = await supabase
        .from("model_alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          parent_alert_id: alertId,
        })
        .eq("id", alertId);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["model_alerts"] });
      qc.invalidateQueries({ queryKey: ["assumptions"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success("Suggestion applied");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Bulk-create alerts from candidates produced by detectAlerts/detectTrends. */
export const useCreateAlerts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      weekStartDate,
      candidates,
    }: {
      weekStartDate: string;
      candidates: AlertCandidate[];
    }) => {
      if (!candidates.length) return { created: 0, autoResolved: 0 };

      // Get current open alerts for this week to detect auto-resolves
      const { data: openExisting } = await supabase
        .from("model_alerts")
        .select("id, assumption_key, category")
        .eq("status", "open")
        .eq("week_start_date", weekStartDate);

      const candidateKeys = new Set(
        candidates.map((c) => `${c.assumption_key}|${c.category}`)
      );

      // Auto-resolve any existing open alerts whose key is no longer flagged
      const toResolve = (openExisting ?? []).filter(
        (a) => !candidateKeys.has(`${a.assumption_key}|${a.category}`)
      );
      let autoResolved = 0;
      for (const a of toResolve) {
        await supabase
          .from("model_alerts")
          .update({
            status: "resolved",
            resolved_at: new Date().toISOString(),
            auto_resolved: true,
            dismissal_reason: "Auto-resolved — variance within threshold.",
          })
          .eq("id", a.id);
        autoResolved += 1;
      }

      // Insert new alerts (skip duplicates via unique partial index on open status)
      const rows = candidates.map((c) => ({
        week_start_date: weekStartDate,
        category: c.category,
        assumption_key: c.assumption_key,
        modeled_amount: c.modeled_amount,
        actual_amount: c.actual_amount,
        variance_pct: c.variance_pct,
        variance_dollar: c.variance_dollar,
        severity: c.severity,
        title: c.title,
        detail: c.detail,
        suggested_value: c.suggested_value ?? null,
      }));
      const { error } = await supabase
        .from("model_alerts")
        .upsert(rows, {
          onConflict: "week_start_date,assumption_key,category",
          ignoreDuplicates: true,
        } as never);
      if (error && !/duplicate/i.test(error.message)) throw error;

      return { created: rows.length, autoResolved };
    },
    onSuccess: ({ created, autoResolved }) => {
      qc.invalidateQueries({ queryKey: ["model_alerts"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      if (created > 0 || autoResolved > 0) {
        toast.success(
          `${created} alert${created === 1 ? "" : "s"} flagged${autoResolved ? ` · ${autoResolved} auto-resolved` : ""}`
        );
      }
    },
  });
};

/** Save variance snapshots for the week. Used for drift dots and trend detection. */
export const useSaveVarianceSnapshots = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: SnapshotRow[]) => {
      if (!rows.length) return;
      const { error } = await supabase
        .from("variance_snapshots")
        .upsert(rows, { onConflict: "week_start_date,assumption_key" } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variance_snapshots"] });
    },
  });
};

export const useVarianceSnapshots = (assumptionKey?: string) =>
  useQuery({
    queryKey: ["variance_snapshots", assumptionKey ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("variance_snapshots")
        .select("*")
        .order("week_start_date", { ascending: false })
        .limit(assumptionKey ? 12 : 500);
      if (assumptionKey) q = q.eq("assumption_key", assumptionKey);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SnapshotRow[];
    },
  });
