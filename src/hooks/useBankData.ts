import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BankSource, ParsedTxn } from "@/lib/bankParsers/types";

// ============ Bank transactions ============
export type BankTransaction = {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  balance: number | null;
  category: string;
  bank_source: BankSource;
  source: string;
  import_filename: string | null;
  notes: string | null;
  created_at: string;
};

export const useBankTransactions = (filters?: {
  from?: string;
  to?: string;
  source?: BankSource;
  category?: string;
  vendorContains?: string;
  minAmount?: number;
  maxAmount?: number;
}) =>
  useQuery({
    queryKey: ["bank_transactions", filters],
    queryFn: async () => {
      let q = supabase.from("bank_transactions").select("*").order("date", { ascending: false }).limit(2000);
      if (filters?.from) q = q.gte("date", filters.from);
      if (filters?.to) q = q.lte("date", filters.to);
      if (filters?.source) q = q.eq("bank_source", filters.source);
      if (filters?.category) q = q.eq("category", filters.category);
      if (filters?.vendorContains) q = q.ilike("vendor", `%${filters.vendorContains}%`);
      if (filters?.minAmount != null) q = q.gte("amount", filters.minAmount);
      if (filters?.maxAmount != null) q = q.lte("amount", filters.maxAmount);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BankTransaction[];
    },
  });

export const useImportBankTransactions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rows,
      filename,
    }: {
      rows: ParsedTxn[];
      filename: string;
    }) => {
      if (!rows.length) return { inserted: 0, skipped: 0 };
      // Tag inserts as imports for the audit trail.
      await supabase.rpc("set_import_context", { filename });
      const payload = rows.map((r) => ({
        date: r.date,
        vendor: r.vendor,
        amount: r.amount,
        balance: r.balance,
        category: r.category,
        bank_source: r.bank_source,
        source: "import",
        import_filename: filename,
      }));
      // Upsert on the natural key prevents duplicates on re-upload.
      const { data, error } = await supabase
        .from("bank_transactions")
        .upsert(payload, {
          onConflict: "date,vendor,amount,bank_source",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
    },
    onSuccess: ({ inserted, skipped }) => {
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      toast.success(`Imported ${inserted} transactions${skipped > 0 ? ` (${skipped} duplicates skipped)` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateBankTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await supabase.from("bank_transactions").update({ category }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      toast.success("Transaction updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Bank statements ============
export type BankStatement = {
  id: string;
  bank_source: BankSource;
  statement_date: string;
  closing_balance: number;
  filename: string;
  created_at: string;
};

export const useBankStatements = () =>
  useQuery({
    queryKey: ["bank_statements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_statements")
        .select("*")
        .order("statement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankStatement[];
    },
  });

export const useUploadStatement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bank_source: BankSource;
      statement_date: string;
      closing_balance: number;
      filename: string;
    }) => {
      const { error } = await supabase
        .from("bank_statements")
        .upsert(input, { onConflict: "bank_source,statement_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_statements"] });
      toast.success("Statement saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Bank category rules ============
export type BankCategoryRule = {
  id: string;
  vendor_contains: string;
  category: string;
  bank_source: BankSource | null;
  created_at: string;
};

export const useBankCategoryRules = () =>
  useQuery({
    queryKey: ["bank_category_rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_category_rules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankCategoryRule[];
    },
  });

export const useUpsertCategoryRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { vendor_contains: string; category: string; bank_source?: BankSource | null }) => {
      const { error } = await supabase
        .from("bank_category_rules")
        .upsert(
          { vendor_contains: input.vendor_contains, category: input.category, bank_source: input.bank_source ?? null },
          { onConflict: "vendor_contains,bank_source" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_category_rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Weekly checklist ============
export type ChecklistItem = {
  id: string;
  week_start_date: string;
  item_key: string;
  completed: boolean;
  completed_by_email: string | null;
  completed_at: string | null;
};

export const useWeeklyChecklist = (weekStartDate: string) =>
  useQuery({
    queryKey: ["weekly_checklist", weekStartDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_checklist")
        .select("*")
        .eq("week_start_date", weekStartDate);
      if (error) throw error;
      return (data ?? []) as ChecklistItem[];
    },
  });

export const useToggleChecklistItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      week_start_date,
      item_key,
      completed,
      email,
    }: {
      week_start_date: string;
      item_key: string;
      completed: boolean;
      email: string | null;
    }) => {
      const { error } = await supabase.from("weekly_checklist").upsert(
        {
          week_start_date,
          item_key,
          completed,
          completed_by_email: completed ? email : null,
          completed_at: completed ? new Date().toISOString() : null,
        },
        { onConflict: "week_start_date,item_key" }
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly_checklist", vars.week_start_date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
