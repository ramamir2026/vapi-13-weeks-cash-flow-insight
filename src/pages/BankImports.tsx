import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, X, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { setImportContext } from "@/hooks/useControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  parseSvbCsv,
  CATEGORY_LABEL,
  CATEGORY_TO_ACTUAL_KEY,
  type ParsedSvbRow,
  type SvbCategory,
} from "@/lib/parseSvbCsv";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";

type RowState = ParsedSvbRow & { confirmed: boolean };

const CATEGORY_OPTIONS: SvbCategory[] = [
  "payroll",
  "cogs",
  "card_payments",
  "rent",
  "opex",
  "stripe_revenue",
  "enterprise_revenue",
  "ar_collections",
  "zba_sweep",
  "unmatched",
];

const warnText = "text-[hsl(var(--warn-amber))]";
const warnBg = "bg-[hsl(var(--warn-amber))]/10";
const warnBorder = "border-[hsl(var(--warn-amber))]/40";

const BankImports = () => {
  const qc = useQueryClient();
  const [rows, setRows] = useState<RowState[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseSvbCsv(text);
    if (parsed.length === 0) {
      toast.error("No transactions found. Check the file format.");
      return;
    }
    setFilename(file.name);
    setRows(
      parsed.map((r) => ({
        ...r,
        confirmed: r.category !== "unmatched" && r.category !== "zba_sweep",
      }))
    );
    toast.success(`Parsed ${parsed.length} transactions from ${file.name}`);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const reset = () => {
    setRows([]);
    setFilename("");
  };

  const summary = useMemo(() => {
    const confirmed = rows.filter((r) => r.confirmed);
    const byCategory: Record<string, { count: number; total: number }> = {};
    for (const r of confirmed) {
      const k = CATEGORY_LABEL[r.category];
      byCategory[k] = byCategory[k] ?? { count: 0, total: 0 };
      byCategory[k].count += 1;
      byCategory[k].total += Math.abs(r.amount);
    }
    const unmatched = rows.filter((r) => r.category === "unmatched").length;
    return { confirmed: confirmed.length, total: rows.length, byCategory, unmatched };
  }, [rows]);

  const apply = useMutation({
    mutationFn: async () => {
      const confirmed = rows.filter((r) => r.confirmed && CATEGORY_TO_ACTUAL_KEY[r.category]);
      if (confirmed.length === 0) {
        throw new Error("No confirmed transactions to apply.");
      }

      // Group by week, then category → sum absolute amounts
      type WeekBucket = { weekStart: string; map: Record<string, number> };
      const byWeek = new Map<string, WeekBucket>();
      for (const r of confirmed) {
        const key = CATEGORY_TO_ACTUAL_KEY[r.category];
        if (!key) continue;
        const bucket = byWeek.get(r.weekStart) ?? { weekStart: r.weekStart, map: {} };
        bucket.map[key] = (bucket.map[key] ?? 0) + Math.abs(r.amount);
        byWeek.set(r.weekStart, bucket);
      }

      // Tag this transaction batch as an import for the audit trigger
      await setImportContext(filename || "svb-import.csv");

      for (const bucket of byWeek.values()) {
        const { data: existing } = await supabase
          .from("weekly_actuals")
          .select("*")
          .eq("week_start_date", bucket.weekStart)
          .maybeSingle();

        let merged: Record<string, number> = {};
        if (existing?.notes) {
          try {
            merged = JSON.parse(existing.notes);
          } catch {
            merged = {};
          }
        }
        // Imported values overwrite existing keys for clarity
        merged = { ...merged, ...bucket.map };

        if (existing) {
          const { error } = await supabase
            .from("weekly_actuals")
            .update({
              notes: JSON.stringify(merged),
              closing_cash_balance:
                merged.closingBalance ?? existing.closing_cash_balance ?? 0,
              source: "import",
              import_filename: filename,
              import_locked: true,
            })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("weekly_actuals").insert({
            week_start_date: bucket.weekStart,
            notes: JSON.stringify(merged),
            closing_cash_balance: merged.closingBalance ?? 0,
            source: "import",
            import_filename: filename,
            import_locked: true,
          } as never);
          if (error) throw error;
        }
      }

      return byWeek.size;
    },
    onSuccess: (weekCount) => {
      qc.invalidateQueries({ queryKey: ["weekly_actuals_prior"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success(`Applied actuals to ${weekCount} week${weekCount === 1 ? "" : "s"}`);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SVB Transaction Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload an SVB transaction export (CSV with Date, Description, Amount, Balance).
            Transactions are auto-categorized — review and confirm to populate Actuals. This is
            optional; you can still type actuals manually on the Dashboard.
          </p>
          <RoleGate
            role="editor"
            fallback={
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Viewers cannot upload bank files.
              </div>
            }
          >
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-sm transition-colors",
                dragOver
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <Upload className="h-6 w-6" />
              <div className="font-medium">Drop SVB CSV here, or click to choose</div>
              <div className="text-xs">Date · Description · Amount · Balance</div>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onPick} />
            </label>
          </RoleGate>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                {filename}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.confirmed} of {summary.total} confirmed
                {summary.unmatched > 0 && (
                  <>
                    {" · "}
                    <span className={warnText}>{summary.unmatched} unmatched</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
              <Button
                onClick={() => apply.mutate()}
                disabled={apply.isPending || summary.confirmed === 0}
              >
                Confirm & Apply to Actuals
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {Object.keys(summary.byCategory).length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.entries(summary.byCategory).map(([label, v]) => (
                  <Badge key={label} variant="outline" className="font-normal">
                    {label}: {v.count} · {formatCurrency(v.total, { compact: true })}
                  </Badge>
                ))}
              </div>
            )}
            {summary.unmatched > 0 && (
              <div className={cn("mb-4 flex items-start gap-2 rounded-md border p-3 text-sm", warnBorder, warnBg, warnText)}>
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  {summary.unmatched} transaction{summary.unmatched === 1 ? "" : "s"} need a
                  category before they can be confirmed. Review and pick a category, or leave
                  unconfirmed to skip.
                </div>
              </div>
            )}
            <div className="overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                    <TableHead className="w-52">Auto-Category</TableHead>
                    <TableHead className="w-20 text-center">Confirm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const isUnmatched = r.category === "unmatched";
                    const isSweep = r.category === "zba_sweep";
                    return (
                      <TableRow
                        key={r.id}
                        className={cn(isUnmatched && warnBg, isSweep && "opacity-60")}
                      >
                        <TableCell className="text-muted-foreground">
                          {isUnmatched && <AlertCircle className={cn("h-4 w-4", warnText)} />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                          {format(new Date(r.date), "MMM d")}
                        </TableCell>
                        <TableCell className="max-w-[420px] truncate text-sm" title={r.description}>
                          {r.description}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            r.amount < 0 ? "text-destructive" : "text-foreground"
                          )}
                        >
                          {r.amount < 0 ? "(" : ""}
                          {formatCurrency(Math.abs(r.amount), { compact: false })}
                          {r.amount < 0 ? ")" : ""}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.category}
                            onValueChange={(v) => {
                              const next = v as SvbCategory;
                              updateRow(r.id, {
                                category: next,
                                confirmed:
                                  next !== "unmatched" && next !== "zba_sweep" ? true : false,
                              });
                            }}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-8 text-xs",
                                isUnmatched && warnBorder
                              )}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORY_OPTIONS.map((c) => (
                                <SelectItem key={c} value={c} className="text-xs">
                                  {CATEGORY_LABEL[c]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={r.confirmed}
                            disabled={isUnmatched || isSweep}
                            onCheckedChange={(checked) =>
                              updateRow(r.id, { confirmed: Boolean(checked) })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BankImports;
