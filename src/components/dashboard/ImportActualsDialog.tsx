import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Row = { key: string; label: string };
type Section = { title: string; rows: Row[] };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  initialMap: Record<string, number>;
  initialClosingBalance: number;
  cogsLabels: { key: string; label: string }[]; // dynamic from forecast (incl. cogs_other)
  opexLabels: { key: string; label: string }[];
}

export const ImportActualsDialog = ({
  open,
  onOpenChange,
  weekStart,
  initialMap,
  initialClosingBalance,
  cogsLabels,
  opexLabels,
}: Props) => {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [closingBalance, setClosingBalance] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const sections = useMemo<Section[]>(
    () => [
      {
        title: "Inflows",
        rows: [
          { key: "openingBalance", label: "Opening Balance" },
          { key: "stripeRevenue", label: "Stripe Revenue" },
          { key: "enterpriseRevenue", label: "Enterprise ACH" },
          { key: "arCollections", label: "A/R Collections" },
          { key: "totalInflows", label: "TOTAL INFLOWS" },
        ],
      },
      {
        title: "Outflows",
        rows: [
          { key: "payroll", label: "Payroll" },
          ...cogsLabels.map((r) => ({ key: `cogs_${r.key.replace(/^cogs_/, "")}`, label: r.label })),
          { key: "brexCard", label: "Brex Card Payment" },
          ...opexLabels.map((r) => ({ key: `opex_${r.key.replace(/^opex_/, "")}`, label: r.label })),
          { key: "rent", label: "Rent" },
          { key: "totalOutflows", label: "TOTAL OUTFLOWS" },
        ],
      },
      {
        title: "Net",
        rows: [{ key: "netChange", label: "Net Cash Flow" }],
      },
    ],
    [cogsLabels, opexLabels]
  );

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const s of sections) {
      for (const r of s.rows) {
        const v = initialMap[r.key];
        next[r.key] = v ? String(v) : "";
      }
    }
    setValues(next);
    setClosingBalance(initialClosingBalance ? String(initialClosingBalance) : "");
  }, [open, initialMap, initialClosingBalance, sections]);

  const parse = (s: string) => parseFloat(s.replace(/[, $]/g, "")) || 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const merged: Record<string, number> = { ...initialMap };
      for (const s of sections) {
        for (const r of s.rows) {
          const raw = values[r.key] ?? "";
          if (raw === "") {
            delete merged[r.key];
          } else {
            merged[r.key] = parse(raw);
          }
        }
      }
      const closing = parse(closingBalance);
      merged.closingBalance = closing;

      const { data: existing } = await supabase
        .from("weekly_actuals")
        .select("*")
        .eq("week_start_date", weekStart)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("weekly_actuals")
          .update({
            notes: JSON.stringify(merged),
            closing_cash_balance: closing,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("weekly_actuals").insert({
          week_start_date: weekStart,
          notes: JSON.stringify(merged),
          closing_cash_balance: closing,
        } as any);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["weekly_actuals_prior"] });
      toast.success("Actuals imported");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Actuals</DialogTitle>
          <DialogDescription>
            Bulk-edit actuals for week starting {weekStart}. Leave a field blank to clear it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {section.rows.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`act-${r.key}`} className="text-sm flex-1">
                      {r.label}
                    </Label>
                    <Input
                      id={`act-${r.key}`}
                      inputMode="decimal"
                      value={values[r.key] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [r.key]: e.target.value }))
                      }
                      placeholder="—"
                      className="w-36 text-right tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="act-closingBalance" className="text-sm font-semibold flex-1">
              Closing Cash Balance
            </Label>
            <Input
              id="act-closingBalance"
              inputMode="decimal"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              placeholder="—"
              className="w-36 text-right tabular-nums font-semibold"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Actuals"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
