// Multi-file confirmation grid for bank imports.
// Drop several CSVs → detect each → show one row per file with detected file
// type, mapped account, numeric confidence, and an override dropdown.
// Auto-accepts rows ≥ 0.8 confidence. Completeness checks flag missing
// required accounts and duplicate account mappings.
import { useCallback, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Upload, X, ShieldAlert, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { detectAndParse } from "@/lib/bankParsers/detect";
import {
  BANK_LABEL,
  BANK_TO_ASSUMPTION_KEY,
  type BankSource,
  type ParsedTxn,
} from "@/lib/bankParsers/types";
import { toast } from "sonner";

// Confidence string → numeric score. ≥ 0.8 auto-accepts.
export const CONFIDENCE_SCORE: Record<"high" | "medium" | "low", number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

const AUTO_ACCEPT_THRESHOLD = 0.8;

// Required for a full snapshot of spendable cash. Collateral is intentionally
// NOT required — it's restricted and excluded from spendable cash.
const REQUIRED_SOURCES: BankSource[] = [
  "brex_primary",
  "brex_treasury",
  "brex_stripe_clearing",
  "svb_checking",
  "svb_money_market",
  "ramp_checking",
  "ramp_treasury",
];

const ALL_SOURCES: BankSource[] = [
  "brex_primary",
  "brex_treasury",
  "brex_stripe_clearing",
  "brex_card",
  "svb_checking",
  "svb_money_market",
  "svb_collateral",
  "stripe",
  "ramp_checking",
  "ramp_treasury",
];

// Accounts whose balance is restricted (held as collateral) and therefore
// excluded from the spendable opening-cash sum in the forecast.
export const RESTRICTED_SOURCES: ReadonlySet<BankSource> = new Set<BankSource>([
  "svb_collateral",
]);

const FILE_TYPE_LABEL: Record<BankSource, string> = {
  brex_primary: "Brex CSV",
  brex_treasury: "Brex CSV",
  brex_stripe_clearing: "Brex CSV",
  brex_card: "Brex card statement",
  svb_checking: "SVB BAI export",
  svb_money_market: "SVB sweep report",
  svb_collateral: "SVB BAI export",
  stripe: "Stripe payouts CSV",
  ramp_checking: "Ramp CSV",
  ramp_treasury: "Ramp CSV",
};

interface StagedFile {
  id: string;
  filename: string;
  detectedSource: BankSource;
  overrideSource: BankSource;
  confidence: "high" | "medium" | "low";
  score: number;
  warnings: string[];
  rows: ParsedTxn[];
  confirmed: boolean;
}

const warnText = "text-[hsl(var(--warn-amber))]";
const warnBg = "bg-[hsl(var(--warn-amber))]/10";
const warnBorder = "border-[hsl(var(--warn-amber))]/40";

interface BatchDetectCardProps {
  onImportFile: (args: {
    rows: ParsedTxn[];
    filename: string;
    bank_source: BankSource;
  }) => Promise<void>;
  disabled?: boolean;
}

export const BatchDetectCard = ({ onImportFile, disabled }: BatchDetectCardProps) => {
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleFiles = useCallback(async (list: FileList | File[]) => {
    const arr = Array.from(list);
    const staged: StagedFile[] = [];
    for (const file of arr) {
      const lower = file.name.toLowerCase();
      const looksCsv =
        lower.endsWith(".csv") ||
        file.type === "text/csv" ||
        file.type === "application/vnd.ms-excel";
      if (!looksCsv) {
        toast.error(`${file.name}: not a CSV — skipped.`);
        continue;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        toast.error(`${file.name}: could not read file.`);
        continue;
      }
      const result = detectAndParse(text, file.name);
      const score = CONFIDENCE_SCORE[result.confidence];
      staged.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        filename: file.name,
        detectedSource: result.source,
        overrideSource: result.source,
        confidence: result.confidence,
        score,
        warnings: result.warnings,
        rows: result.rows,
        confirmed: score >= AUTO_ACCEPT_THRESHOLD,
      });
    }
    if (staged.length) {
      setFiles((prev) => [...prev, ...staged]);
      const auto = staged.filter((s) => s.confirmed).length;
      toast.success(
        `Staged ${staged.length} file${staged.length === 1 ? "" : "s"}. ${auto} auto-accepted (≥ 0.8 confidence).`
      );
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void handleFiles(e.target.files);
    e.target.value = "";
  };

  const updateFile = (id: string, patch: Partial<StagedFile>) =>
    setFiles((fs) =>
      fs.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        // Manual override → require explicit confirmation
        if (patch.overrideSource && patch.overrideSource !== f.detectedSource) {
          next.confirmed = false;
        }
        return next;
      })
    );

  const removeFile = (id: string) =>
    setFiles((fs) => fs.filter((f) => f.id !== id));

  // -------- completeness checks --------
  const completeness = useMemo(() => {
    const confirmed = files.filter((f) => f.confirmed);
    const mappedSources = confirmed.map((f) => f.overrideSource);
    const counts = new Map<BankSource, number>();
    for (const s of mappedSources) counts.set(s, (counts.get(s) ?? 0) + 1);
    const duplicates: BankSource[] = [];
    for (const [src, n] of counts) if (n > 1) duplicates.push(src);
    const missing = REQUIRED_SOURCES.filter((src) => !counts.has(src));
    return { duplicates, missing, confirmedCount: confirmed.length };
  }, [files]);

  const handleImportAll = async () => {
    const toImport = files.filter((f) => f.confirmed && f.rows.length > 0);
    if (!toImport.length) {
      toast.error("Nothing to import — confirm at least one file.");
      return;
    }
    setImporting(true);
    try {
      for (const f of toImport) {
        const rowsForSource = f.rows.map((r) => ({ ...r, bank_source: f.overrideSource }));
        await onImportFile({
          rows: rowsForSource,
          filename: f.filename,
          bank_source: f.overrideSource,
        });
      }
      toast.success(`Imported ${toImport.length} file${toImport.length === 1 ? "" : "s"}.`);
      setFiles([]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Batch detect &amp; confirm</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Drop multiple bank CSVs at once. Each file is auto-detected; rows with confidence ≥{" "}
          <span className="font-medium text-foreground">0.8</span> are pre-confirmed. Anything lower
          requires manual confirmation. The completeness check below flags missing required accounts
          and duplicates.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-sm transition-colors",
            dragOver
              ? "border-primary bg-primary/5 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <Upload className="h-5 w-5" />
          <div className="font-medium">Drop one or more CSVs, or click to choose</div>
          <input type="file" accept=".csv,text/csv" multiple className="hidden" onChange={onPick} />
        </label>

        {files.length > 0 && (
          <>
            <div className="overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Detected type</TableHead>
                    <TableHead>Mapped account</TableHead>
                    <TableHead className="w-32">Confidence</TableHead>
                    <TableHead className="w-24 text-right">Rows</TableHead>
                    <TableHead className="w-20 text-center">Confirm</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((f) => {
                    const isRestricted = RESTRICTED_SOURCES.has(f.overrideSource);
                    const isDuplicate =
                      f.confirmed &&
                      completeness.duplicates.includes(f.overrideSource);
                    const isAutoAccepted =
                      f.score >= AUTO_ACCEPT_THRESHOLD &&
                      f.overrideSource === f.detectedSource;
                    return (
                      <TableRow
                        key={f.id}
                        className={cn(isDuplicate && warnBg)}
                      >
                        <TableCell
                          className="max-w-[280px] truncate text-sm"
                          title={f.filename}
                        >
                          {f.filename}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {FILE_TYPE_LABEL[f.detectedSource] ?? "Unknown"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={f.overrideSource}
                              onValueChange={(v) =>
                                updateFile(f.id, { overrideSource: v as BankSource })
                              }
                            >
                              <SelectTrigger className="h-8 w-[220px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALL_SOURCES.map((b) => (
                                  <SelectItem key={b} value={b} className="text-xs">
                                    {BANK_LABEL[b]}
                                    {RESTRICTED_SOURCES.has(b) ? " — restricted" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isRestricted && (
                              <Badge
                                variant="outline"
                                className={cn("gap-1 text-[10px]", warnBorder, warnText)}
                                title="Restricted collateral — excluded from spendable opening cash"
                              >
                                <Lock className="h-3 w-3" /> restricted
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                f.confidence === "high" &&
                                  "border-[hsl(var(--success))]/40 text-[hsl(var(--success))]",
                                f.confidence === "medium" && cn(warnBorder, warnText),
                                f.confidence === "low" && "border-destructive/40 text-destructive"
                              )}
                            >
                              {f.score.toFixed(2)}
                            </Badge>
                            {isAutoAccepted && (
                              <span className="text-[10px] text-muted-foreground">auto</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {f.rows.length}
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={f.confirmed}
                            onCheckedChange={(c) =>
                              updateFile(f.id, { confirmed: Boolean(c) })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => removeFile(f.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Completeness panel */}
            <div
              className={cn(
                "rounded-md border p-3 text-xs",
                completeness.missing.length || completeness.duplicates.length
                  ? cn(warnBorder, warnBg, warnText)
                  : "border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5 text-[hsl(var(--success))]"
              )}
            >
              <div className="flex items-start gap-2">
                {completeness.missing.length || completeness.duplicates.length ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="space-y-1">
                  {completeness.missing.length > 0 && (
                    <div>
                      <span className="font-medium">Missing required accounts:</span>{" "}
                      {completeness.missing.map((s) => BANK_LABEL[s]).join(", ")}
                    </div>
                  )}
                  {completeness.duplicates.length > 0 && (
                    <div>
                      <span className="font-medium">Duplicate mappings:</span>{" "}
                      {completeness.duplicates
                        .map((s) => `${BANK_LABEL[s]} (${
                          files.filter((f) => f.confirmed && f.overrideSource === s).length
                        } files)`)
                        .join(", ")}{" "}
                      — two files map to the same account. Re-check overrides before importing.
                    </div>
                  )}
                  {!completeness.missing.length && !completeness.duplicates.length && (
                    <div>All required accounts covered, no duplicate mappings.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Per-file warnings */}
            {files.some((f) => f.warnings.length > 0) && (
              <div className="space-y-1 text-xs text-muted-foreground">
                {files
                  .filter((f) => f.warnings.length > 0)
                  .map((f) => (
                    <div key={f.id} className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                      <div>
                        <span className="font-medium text-foreground">{f.filename}:</span>{" "}
                        {f.warnings.join(" ")}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {completeness.confirmedCount} of {files.length} confirmed
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                  <X className="mr-1 h-4 w-4" /> Clear all
                </Button>
                <Button
                  onClick={handleImportAll}
                  disabled={
                    disabled ||
                    importing ||
                    completeness.confirmedCount === 0 ||
                    completeness.duplicates.length > 0
                  }
                >
                  {importing
                    ? "Importing…"
                    : `Import ${completeness.confirmedCount} file${
                        completeness.confirmedCount === 1 ? "" : "s"
                      }`}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
