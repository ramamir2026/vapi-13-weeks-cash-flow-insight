import { useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useApplyHirePayrollOverride,
  useDeleteHire,
  useFutureHires,
  useUpsertHire,
  type FutureHire,
  type HireStatus,
} from "@/hooks/useFinanceData";
import {
  HireInlineRow,
  type HireRowDraft,
} from "@/components/hires/HireInlineRow";
import { HiresCsvDropzone } from "@/components/hires/HiresCsvDropzone";
import { HiresCsvPreviewDialog } from "@/components/hires/HiresCsvPreviewDialog";
import { PayrollImpactGrid } from "@/components/hires/PayrollImpactGrid";
import { parseHiresCsv, type ParsedHireRow } from "@/lib/parseHiresCsv";
import {
  PAYROLL_PERIODS,
  periodCellAmount,
  periodsToWeeks,
} from "@/lib/payrollPeriods";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

const FutureHires = () => {
  const { data: hires, isLoading } = useFutureHires();
  const upsert = useUpsertHire();
  const del = useDeleteHire();
  const apply = useApplyHirePayrollOverride();

  const [showNew, setShowNew] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<ParsedHireRow[]>([]);
  const [previewFile, setPreviewFile] = useState("");
  const [importing, setImporting] = useState(false);

  const handleSaveRow = async (draft: HireRowDraft) => {
    const payload: Partial<FutureHire> & { id?: string } = {
      id: draft.id,
      name: draft.name,
      role: draft.role,
      annual_salary: draft.annual_salary,
      start_date: draft.start_date,
      status: draft.status as HireStatus,
      notes: draft.notes || null,
    };
    await upsert.mutateAsync(payload);
    if (!draft.id) setShowNew(false);
  };

  const handleCsv = (text: string, fileName: string) => {
    const rows = parseHiresCsv(text);
    if (rows.length === 0) {
      toast.error("No rows found in CSV");
      return;
    }
    setPreviewRows(rows);
    setPreviewFile(fileName);
    setPreviewOpen(true);
  };

  const handleConfirmImport = async (rows: ParsedHireRow[]) => {
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const r of rows) {
      try {
        await upsert.mutateAsync({
          name: r.name,
          role: r.role,
          annual_salary: r.annualSalary,
          start_date: r.startDate,
          status: r.status,
          notes: r.notes || null,
        } as Partial<FutureHire>);
        ok++;
      } catch {
        fail++;
      }
    }
    setImporting(false);
    setPreviewOpen(false);
    toast.success(
      `Imported ${ok} hire${ok === 1 ? "" : "s"}${fail ? ` (${fail} failed)` : ""}`
    );
  };

  // Period totals across all hires
  const periodTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of PAYROLL_PERIODS) {
      totals[p.key] = (hires ?? []).reduce(
        (s, h) => s + periodCellAmount(h.start_date, Number(h.annual_salary), p),
        0
      );
    }
    return totals;
  }, [hires]);

  const grandTotal = useMemo(
    () => Object.values(periodTotals).reduce((s, v) => s + v, 0),
    [periodTotals]
  );

  const handleApplyToModel = () => {
    const weeks = periodsToWeeks(periodTotals);
    const periods = PAYROLL_PERIODS.map((p) => ({
      key: p.key,
      total: periodTotals[p.key] ?? 0,
    }));
    apply.mutate({ weeks, periods });
  };

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Future Hires</h2>
          <p className="text-sm text-muted-foreground">
            Planned hires feed payroll periods P1–P6 → forecast weeks W2/W4/W6/W8/W10/W12.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowNew(true)} disabled={showNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add hire
          </Button>
          <Button onClick={handleApplyToModel} disabled={apply.isPending}>
            <Sparkles className="mr-2 h-4 w-4" />
            Apply to Model
          </Button>
        </div>
      </div>

      <HiresCsvDropzone onFile={handleCsv} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead className="min-w-[160px]">Role</TableHead>
                  <TableHead className="min-w-[140px]">Annual Salary</TableHead>
                  <TableHead className="min-w-[170px]">Start Date</TableHead>
                  <TableHead className="min-w-[180px]">Status</TableHead>
                  <TableHead className="min-w-[180px]">Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(hires ?? []).map((h) => (
                  <HireInlineRow
                    key={h.id}
                    hire={h}
                    onSave={handleSaveRow}
                    onDelete={() => del.mutate(h.id)}
                  />
                ))}
                {showNew && (
                  <HireInlineRow
                    onSave={handleSaveRow}
                    isNew
                    onCancelNew={() => setShowNew(false)}
                  />
                )}
                {(hires?.length ?? 0) === 0 && !showNew && (
                  <TableRow>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-sm text-muted-foreground"
                    >
                      No hires yet. Add one or drop a CSV above.
                    </td>
                  </TableRow>
                )}
              </TableBody>
              <tfoot>
                <tr className="border-t bg-muted/30 text-sm font-medium">
                  <td className="p-3" colSpan={2}>
                    {hires?.length ?? 0} hire{hires?.length === 1 ? "" : "s"}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatCurrency(
                      (hires ?? []).reduce(
                        (s, h) => s + Number(h.annual_salary),
                        0
                      )
                    )}
                  </td>
                  <td colSpan={4} className="p-3 text-right text-muted-foreground">
                    Annual run-rate
                  </td>
                </tr>
                <tr className="border-t bg-muted/30 text-sm font-medium">
                  <td className="p-3" colSpan={6}>
                    13-week payroll impact (sum of P1–P6)
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatCurrency(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PayrollImpactGrid hires={hires ?? []} />

      <HiresCsvPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        rows={previewRows}
        fileName={previewFile}
        onConfirm={handleConfirmImport}
        importing={importing}
      />
    </div>
  );
};

export default FutureHires;
