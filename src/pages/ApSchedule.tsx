import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CsvDropzone } from "@/components/ar/CsvDropzone";
import {
  useApWeeklyOverride,
  useApplyApOverride,
} from "@/hooks/useFinanceData";
import {
  parseApCsv,
  ApCsvParseError,
  AP_HORIZON_WEEKS,
  AP_VENDOR_LABELS,
  type ParsedApResult,
} from "@/lib/parseApCsv";
import { formatCurrency } from "@/lib/format";
import { getCurrentMondayKey } from "@/lib/weekKey";
import { toast } from "sonner";

const weekHeaders = Array.from({ length: AP_HORIZON_WEEKS }, (_, i) => `W${i + 1}`);

const ApSchedule = () => {
  const forecastStartIso = getCurrentMondayKey();
  const { data: applied } = useApWeeklyOverride();
  const apply = useApplyApOverride();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<ParsedApResult | null>(null);
  const [previewFile, setPreviewFile] = useState("");

  const handleCsv = (text: string, fileName: string) => {
    try {
      const result = parseApCsv(text, { forecastStartIso });
      setPreviewResult(result);
      setPreviewFile(fileName);
      setPreviewOpen(true);
    } catch (err) {
      const message =
        err instanceof ApCsvParseError
          ? err.message
          : "Could not read this file. Please check the format and try again.";
      toast.error(message);
    }
  };

  const handleConfirm = () => {
    if (!previewResult) return;
    apply.mutate(
      {
        weeksByVendor: previewResult.weeksByVendor,
        weeksTotal: previewResult.weeksTotal,
        importFilename: previewFile,
      },
      {
        onSuccess: () => {
          setPreviewOpen(false);
          setPreviewResult(null);
        },
      },
    );
  };

  const previewVendorKeys = useMemo(
    () => (previewResult ? Object.keys(previewResult.weeksByVendor).sort() : []),
    [previewResult],
  );
  const appliedVendorKeys = useMemo(
    () => (applied ? Object.keys(applied.weeks_by_vendor).sort() : []),
    [applied],
  );

  const vendorLabel = (key: string): string =>
    (AP_VENDOR_LABELS as Record<string, string>)[key] ?? key;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">A/P Aging</h2>
        <p className="text-sm text-muted-foreground">
          Import the Rillet A/P Aging Details report to drive W1–W5 COGS from real
          bill due dates. W6+ keeps the calendar pay-day model.
        </p>
      </div>

      <CsvDropzone
        onFile={handleCsv}
        sheetPattern={/ap aging|aging details|^ap$/i}
        title="Drop Rillet A/P Aging Details (CSV or Excel) here"
        subtitle="or click to browse · maps Anthropic, OpenAI, Deepgram, Azure, Pump/AWS, ElevenLabs, Gemini, Twilio"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currently applied to model</CardTitle>
        </CardHeader>
        <CardContent>
          {!applied ? (
            <p className="text-sm text-muted-foreground">
              No A/P override for the week of {forecastStartIso}. The forecast is
              using the calendar pay-day model for COGS across all 13 weeks.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Imported {applied.import_filename ?? "(unnamed file)"} ·{" "}
                {new Date(applied.created_at).toLocaleString()}
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Vendor</TableHead>
                      {weekHeaders.map((h) => (
                        <TableHead key={h} className="text-right">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appliedVendorKeys.map((k) => (
                      <TableRow key={k}>
                        <TableCell className="font-medium">{vendorLabel(k)}</TableCell>
                        {applied.weeks_by_vendor[k].map((v, i) => (
                          <TableCell key={i} className="text-right tabular-nums">
                            {v ? formatCurrency(v) : "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className="border-t bg-muted/30 text-sm font-medium">
                      <TableCell>Total</TableCell>
                      {applied.weeks_total.map((v, i) => (
                        <TableCell key={i} className="text-right tabular-nums">
                          {formatCurrency(v)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview A/P import</DialogTitle>
            <DialogDescription>
              {previewFile} · forecast week of {forecastStartIso}
            </DialogDescription>
          </DialogHeader>

          {previewResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Bills mapped</div>
                  <div className="text-lg font-semibold">{previewResult.bills.length}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Non-COGS skipped</div>
                  <div className="text-lg font-semibold">{previewResult.nonCogsSkipped}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Out of horizon (W6+)</div>
                  <div className="text-lg font-semibold">
                    {formatCurrency(previewResult.outOfHorizon)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Vendor</TableHead>
                      {weekHeaders.map((h) => (
                        <TableHead key={h} className="text-right">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewVendorKeys.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={1 + AP_HORIZON_WEEKS} className="text-center text-sm text-muted-foreground">
                          No bills mapped to COGS vendors in the next 5 weeks.
                        </TableCell>
                      </TableRow>
                    )}
                    {previewVendorKeys.map((k) => (
                      <TableRow key={k}>
                        <TableCell className="font-medium">{vendorLabel(k)}</TableCell>
                        {previewResult.weeksByVendor[k].map((v, i) => (
                          <TableCell key={i} className="text-right tabular-nums">
                            {v ? formatCurrency(v) : "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className="border-t bg-muted/30 text-sm font-medium">
                      <TableCell>Total</TableCell>
                      {previewResult.weeksTotal.map((v, i) => (
                        <TableCell key={i} className="text-right tabular-nums">
                          {formatCurrency(v)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <p className="text-xs text-muted-foreground">
                Other COGS stays smoothed from assumptions. Vendors not present in the
                file keep their calendar pay-day amounts.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={apply.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={apply.isPending || !previewResult}>
              <Sparkles className="mr-2 h-4 w-4" />
              Apply to Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApSchedule;
