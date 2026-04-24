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
  useArEntries,
  useAssumptions,
  useDeleteArEntry,
  useUpsertArEntry,
  useApplyArOverride,
  type ArEntry,
} from "@/hooks/useFinanceData";
import { setImportContext, useIsApprover, useOverrideImportLock } from "@/hooks/useControls";
import { ArInlineRow, encodeNotes, parseNotes, type ArRowDraft } from "@/components/ar/ArInlineRow";
import { CsvDropzone } from "@/components/ar/CsvDropzone";
import { CsvPreviewDialog } from "@/components/ar/CsvPreviewDialog";
import { WeeklySummaryStrip } from "@/components/ar/WeeklySummaryStrip";
import { parseArCsv, type ParsedArRow } from "@/lib/parseArCsv";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

const probabilityForAging = (days: number): number => {
  if (days <= 30) return 0.9;
  if (days <= 60) return 0.75;
  if (days <= 90) return 0.5;
  return 0.2;
};

const currentMondayIso = (): string => {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  return monday.toISOString().slice(0, 10);
};

const ArSchedule = () => {
  const { data: arEntries, isLoading } = useArEntries();
  const { data: assumptions } = useAssumptions();
  const upsert = useUpsertArEntry();
  const del = useDeleteArEntry();
  const applyOverride = useApplyArOverride();
  const isApprover = useIsApprover();
  const overrideLock = useOverrideImportLock();

  const [showNew, setShowNew] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<ParsedArRow[]>([]);
  const [previewFile, setPreviewFile] = useState("");
  const [importing, setImporting] = useState(false);
  const [weighted, setWeighted] = useState(true);

  const forecastStartIso = currentMondayIso();
  const arDelayDays = useMemo(() => {
    const a = assumptions?.find((x) => x.key === "ar_delay_days");
    return a ? Number(a.value) : 0;
  }, [assumptions]);
  const arDelayWeeks = Math.round(arDelayDays / 7);

  const rowComputed = useMemo(() => {
    return (arEntries ?? []).map((e) => {
      const { override } = parseNotes(e.notes);
      const aging = Math.max(
        0,
        Math.round((Date.now() - new Date(e.invoice_date).getTime()) / 86400000)
      );
      const autoProb = probabilityForAging(aging);
      const probability = override != null ? override / 100 : autoProb;
      const expectedDays = Math.round(
        (new Date(e.expected_collection_date).getTime() - new Date(forecastStartIso).getTime()) /
          86400000
      );
      const baseWeek = Math.floor(expectedDays / 7) + 1;
      const shiftedWeek = baseWeek + arDelayWeeks;
      return {
        entry: e,
        amount: Number(e.invoice_amount),
        probability,
        weighted: Number(e.invoice_amount) * probability,
        shiftedWeek,
      };
    });
  }, [arEntries, forecastStartIso, arDelayWeeks]);

  const weightedWeeks = useMemo(() => {
    const arr = new Array(13).fill(0);
    for (const r of rowComputed) {
      if (r.shiftedWeek >= 1 && r.shiftedWeek <= 13) arr[r.shiftedWeek - 1] += r.weighted;
    }
    return arr;
  }, [rowComputed]);

  const rawWeeks = useMemo(() => {
    const arr = new Array(13).fill(0);
    for (const r of rowComputed) {
      if (r.shiftedWeek >= 1 && r.shiftedWeek <= 13) arr[r.shiftedWeek - 1] += r.amount;
    }
    return arr;
  }, [rowComputed]);

  const outOfHorizon = useMemo(
    () =>
      rowComputed
        .filter((r) => r.shiftedWeek > 13 || r.shiftedWeek < 1)
        .reduce((s, r) => s + r.weighted, 0),
    [rowComputed]
  );

  const totalAmount = rowComputed.reduce((s, r) => s + r.amount, 0);
  const totalWeighted = rowComputed.reduce((s, r) => s + r.weighted, 0);

  const handleSaveRow = async (draft: ArRowDraft) => {
    const payload = {
      id: draft.id,
      customer_name: draft.customer_name,
      invoice_number: draft.invoice_number || null,
      invoice_amount: draft.invoice_amount,
      invoice_date: draft.invoice_date,
      expected_collection_date: draft.expected_collection_date,
      notes: encodeNotes(draft.notes, draft.prob_override),
      status: "pending" as const,
    };
    await upsert.mutateAsync(payload as Partial<ArEntry> & { id?: string });
    if (!draft.id) setShowNew(false);
  };

  const handleCsv = (text: string, fileName: string) => {
    const rows = parseArCsv(text);
    if (rows.length === 0) {
      toast.error("No rows found in CSV");
      return;
    }
    setPreviewRows(rows);
    setPreviewFile(fileName);
    setPreviewOpen(true);
  };

  const handleConfirmImport = async (rows: ParsedArRow[]) => {
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const r of rows) {
      const expected = new Date(forecastStartIso);
      expected.setDate(expected.getDate() + (r.expectedWeek - 1) * 7);
      try {
        await setImportContext(previewFile);
        await upsert.mutateAsync({
          customer_name: r.customer,
          invoice_number: r.invoiceNumber || null,
          invoice_amount: r.amount,
          invoice_date: r.invoiceDate,
          expected_collection_date: expected.toISOString().slice(0, 10),
          notes: encodeNotes("", Math.round(r.probability * 100)),
          status: "pending",
          source: "import",
          import_filename: previewFile,
          import_locked: true,
        } as any);
        ok++;
      } catch {
        fail++;
      }
    }
    setImporting(false);
    setPreviewOpen(false);
    toast.success(`Imported ${ok} invoice${ok === 1 ? "" : "s"}${fail ? ` (${fail} failed)` : ""}`);
  };

  const handleApplyToModel = () => {
    // Always probability-weighted, regardless of toggle
    applyOverride.mutate({ weeks: weightedWeeks, delayDays: arDelayDays });
  };

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">A/R Schedule</h2>
          <p className="text-sm text-muted-foreground">
            Probability-weighted collections feed the Dashboard A/R row.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowNew(true)} disabled={showNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add row
          </Button>
          <Button onClick={handleApplyToModel} disabled={applyOverride.isPending}>
            <Sparkles className="mr-2 h-4 w-4" />
            Apply to Model
          </Button>
        </div>
      </div>

      <CsvDropzone onFile={handleCsv} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Customer</TableHead>
                  <TableHead className="min-w-[120px]">Invoice #</TableHead>
                  <TableHead className="min-w-[120px]">Amount</TableHead>
                  <TableHead className="min-w-[150px]">Invoice Date</TableHead>
                  <TableHead className="min-w-[100px]">Prob %</TableHead>
                  <TableHead className="min-w-[90px]">Week</TableHead>
                  <TableHead className="min-w-[160px]">Notes</TableHead>
                  <TableHead className="text-right">Weighted</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(arEntries ?? []).map((entry) => (
                  <ArInlineRow
                    key={entry.id}
                    entry={entry}
                    forecastStartIso={forecastStartIso}
                    onSave={handleSaveRow}
                    onDelete={() => del.mutate(entry.id)}
                    isApprover={isApprover}
                    onOverrideLock={() => overrideLock.mutate({ table: "ar_entries", rowId: entry.id })}
                  />
                ))}
                {showNew && (
                  <ArInlineRow
                    forecastStartIso={forecastStartIso}
                    onSave={handleSaveRow}
                    isNew
                    onCancelNew={() => setShowNew(false)}
                  />
                )}
                {(arEntries?.length ?? 0) === 0 && !showNew && (
                  <TableRow>
                    <td
                      colSpan={9}
                      className="p-8 text-center text-sm text-muted-foreground"
                    >
                      No invoices yet. Add one or drop a QuickBooks CSV above.
                    </td>
                  </TableRow>
                )}
              </TableBody>
              <tfoot>
                <tr className="border-t bg-muted/30 text-sm font-medium">
                  <td className="p-3" colSpan={2}>
                    Totals
                  </td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(totalAmount)}</td>
                  <td colSpan={4} />
                  <td className="p-3 text-right tabular-nums text-foreground">
                    {formatCurrency(totalWeighted)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </Table>
          </div>
        </CardContent>
      </Card>

      <WeeklySummaryStrip
        weightedWeeks={weightedWeeks}
        rawWeeks={rawWeeks}
        weighted={weighted}
        onWeightedChange={setWeighted}
        delayDays={arDelayDays}
        outOfHorizon={outOfHorizon}
      />

      <CsvPreviewDialog
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

export default ArSchedule;
