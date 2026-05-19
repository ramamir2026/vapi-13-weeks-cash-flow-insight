import { useCallback, useMemo, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  X,
  AlertCircle,
  CheckCircle2,
  FileText,
  Database,
} from "lucide-react";
import { format } from "date-fns";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { detectAndParse } from "@/lib/bankParsers/detect";
import {
  BANK_LABEL,
  BANK_TO_ASSUMPTION_KEY,
  type BankSource,
  type ParsedTxn,
} from "@/lib/bankParsers/types";
import {
  extractClosingBalanceFromCsv,
  extractClosingBalanceFromText,
  extractTextFromPdf,
} from "@/lib/bankParsers/statement";
import {
  cardAssumptionKeyForMonth,
  extractCardStatementMonth,
  extractCardTotalFromCsv,
  extractCardTotalFromText,
  isCardStatement,
} from "@/lib/bankParsers/cardStatement";
import {
  useBankCategoryRules,
  useBankStatements,
  useBankTransactionStats,
  useImportBankTransactions,
  useUploadStatement,
  useUpsertCategoryRule,
} from "@/hooks/useBankData";
import { useAssumptions, useUpdateAssumption } from "@/hooks/useFinanceData";
import { useCreateAlerts } from "@/hooks/useAlerts";
import { detectAlerts, type VarianceTxn } from "@/lib/variance";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";

type RowState = ParsedTxn & { confirmed: boolean };

const CATEGORY_OPTIONS = [
  'payroll', 'cogs', 'card_payments', 'rent',
  'sm', 'recruiting', 'legal', 'deel', 'hre', 'ga',
  'stripe_revenue', 'enterprise_revenue', 'ar_collections',
  'zba_sweep', 'unmatched',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  payroll: 'Payroll',
  cogs: 'COGS',
  card_payments: 'Card Payments',
  rent: 'Rent',
  sm: 'Sales & Marketing',
  recruiting: 'Recruiting',
  legal: 'Legal',
  deel: 'Deel / Contractors',
  hre: 'HR / T&E',
  ga: 'G&A',
  stripe_revenue: 'Stripe Revenue',
  enterprise_revenue: 'Enterprise Revenue',
  ar_collections: 'A/R Collections',
  zba_sweep: 'ZBA Sweep (excluded)',
  unmatched: 'Unmatched',
};

const BANK_OPTIONS: BankSource[] = [
  "brex_primary",
  "brex_treasury",
  "brex_stripe_clearing",
  "svb_checking",
  "svb_money_market",
  "stripe",
  "ramp_checking",
  "ramp_treasury",
];

const warnText = "text-[hsl(var(--warn-amber))]";
const warnBg = "bg-[hsl(var(--warn-amber))]/10";
const warnBorder = "border-[hsl(var(--warn-amber))]/40";

// Apply user-defined rules over the auto-detected categories.
const applyRules = (
  rows: ParsedTxn[],
  rules: { vendor_contains: string; category: string; bank_source: BankSource | null }[]
): ParsedTxn[] => {
  if (!rules.length) return rows;
  return rows.map((r) => {
    const match = rules.find(
      (rule) =>
        r.vendor.toLowerCase().includes(rule.vendor_contains.toLowerCase()) &&
        (rule.bank_source == null || rule.bank_source === r.bank_source)
    );
    return match ? { ...r, category: match.category } : r;
  });
};

// "Transactions on file" panel — one card per bank source, above the dropzone.
const TransactionsOnFilePanel = () => {
  const { data: stats = {} as Record<string, { count: number; minDate: string | null; maxDate: string | null; lastUpload: string | null }> } =
    useBankTransactionStats();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-muted-foreground" />
          Transactions on file
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BANK_OPTIONS.map((src) => {
            const s = stats[src];
            const empty = !s || s.count === 0;
            return (
              <div
                key={src}
                className="rounded-md border border-border bg-muted/20 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-foreground">{BANK_LABEL[src]}</div>
                  {!empty && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {s!.count}
                    </Badge>
                  )}
                </div>
                {empty ? (
                  <div className="mt-1 text-xs text-muted-foreground">Not yet uploaded.</div>
                ) : (
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    <div>
                      {format(new Date(s!.minDate!), "MMM d, yyyy")} –{" "}
                      {format(new Date(s!.maxDate!), "MMM d, yyyy")}
                    </div>
                    <div>
                      Last upload {format(new Date(s!.lastUpload!), "MMM d, yyyy")}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const TransactionImportTab = () => {
  const [rows, setRows] = useState<RowState[]>([]);
  const [filename, setFilename] = useState("");
  const [detectedSource, setDetectedSource] = useState<BankSource | null>(null);
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("high");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const importMut = useImportBankTransactions();
  const upsertRule = useUpsertCategoryRule();
  const { data: rules = [] } = useBankCategoryRules();
  const { data: assumptionsList = [] } = useAssumptions();
  const createAlerts = useCreateAlerts();

  const resetPreview = useCallback(() => {
    setRows([]);
    setFilename("");
    setDetectedSource(null);
    setWarnings([]);
    setConfidence("high");
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      // Guard against non-CSV uploads (PDFs go to the Statements tab).
      const lower = file.name.toLowerCase();
      const looksCsv =
        lower.endsWith(".csv") ||
        file.type === "text/csv" ||
        file.type === "application/vnd.ms-excel";
      if (!looksCsv) {
        toast.error("Please upload a CSV file. For PDFs use the Statements tab.");
        return;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        toast.error("Could not read file. Try re-saving as UTF-8 CSV.");
        return;
      }
      const result = detectAndParse(text, file.name);
      if (!result.rows.length) {
        toast.error(result.warnings[0] ?? "No transactions found in file.");
        // Still surface detection so the user can override and retry.
        setFilename(file.name);
        setDetectedSource(result.source);
        setConfidence(result.confidence);
        setWarnings(result.warnings);
        setRows([]);
        return;
      }
      const withRules = applyRules(result.rows, rules);
      setFilename(file.name);
      setDetectedSource(result.source);
      setConfidence(result.confidence);
      setWarnings(result.warnings);
      setRows(
        withRules.map((r) => ({
          ...r,
          confirmed: r.category !== "unmatched" && r.category !== "zba_sweep",
        }))
      );
      toast.success(`Parsed ${result.rows.length} transactions from ${file.name}`);
    },
    [rules]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  const updateRow = (id: string, patch: Partial<RowState>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const switchSource = (next: BankSource) => {
    setDetectedSource(next);
    setRows((rs) => rs.map((r) => ({ ...r, bank_source: next })));
  };

  const summary = useMemo(() => {
    const confirmed = rows.filter((r) => r.confirmed);
    const unmatched = rows.filter((r) => r.category === "unmatched").length;
    const byCategory: Record<string, { count: number; total: number }> = {};
    for (const r of confirmed) {
      const k = CATEGORY_LABEL[r.category] ?? r.category;
      byCategory[k] = byCategory[k] ?? { count: 0, total: 0 };
      byCategory[k].count += 1;
      byCategory[k].total += Math.abs(r.amount);
    }
    return { confirmed: confirmed.length, total: rows.length, unmatched, byCategory };
  }, [rows]);

  const apply = async () => {
    const confirmed = rows.filter((r) => r.confirmed);
    if (!confirmed.length) {
      toast.error("No confirmed transactions to import.");
      return;
    }
    // Save any user-modified categories as rules for future imports.
    const ruleSet = new Set<string>();
    for (const r of confirmed) {
      if (r.category === "unmatched" || r.category === "zba_sweep") continue;
      const key = `${r.vendor.slice(0, 24).toLowerCase()}|${r.category}|${r.bank_source}`;
      if (ruleSet.has(key)) continue;
      ruleSet.add(key);
      void upsertRule.mutate({
        vendor_contains: r.vendor.slice(0, 24),
        category: r.category,
        bank_source: r.bank_source,
      });
    }
    const result = await importMut.mutateAsync({ rows: confirmed, filename });
    const unmatchedCount = summary.unmatched;
    toast.success(
      `Imported ${result.inserted} new transactions. ${result.skipped} already on file.${
        unmatchedCount > 0 ? ` ${unmatchedCount} unmatched — review below.` : ""
      }`
    );

    // Run variance detection over the imported transactions
    if (assumptionsList.length > 0) {
      const assumptionMap: Record<string, number> = {};
      for (const a of assumptionsList) assumptionMap[a.key] = Number(a.value);
      const byWeek = new Map<string, VarianceTxn[]>();
      for (const r of confirmed) {
        const d = new Date(r.date);
        const day = d.getUTCDay();
        const diff = (day + 6) % 7;
        d.setUTCDate(d.getUTCDate() - diff);
        const key = d.toISOString().slice(0, 10);
        const list = byWeek.get(key) ?? [];
        list.push({
          date: r.date,
          vendor: r.vendor,
          amount: Number(r.amount),
          category: r.category,
          bank_source: r.bank_source,
        });
        byWeek.set(key, list);
      }
      for (const [weekStartDate, txns] of byWeek) {
        const candidates = detectAlerts({
          weekStartDate,
          assumptions: assumptionMap,
          txns,
          bankCategoryRules: rules.map((r) => ({ vendor_contains: r.vendor_contains })),
        });
        if (candidates.length > 0) {
          await createAlerts.mutateAsync({ weekStartDate, candidates });
        }
      }
    }
    // Clear preview only — keep dropzone mounted so the next file can be dropped immediately.
    resetPreview();
  };

  return (
    <div className="space-y-6">
      <TransactionsOnFilePanel />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload bank transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Drop a CSV from any source: Brex Primary, Brex Treasury, Brex Stripe Clearing, SVB Checking,
            SVB Money Market, or Stripe. The bank source is auto-detected from the header row and filename
            — override with the dropdown if needed. Re-uploading the same file is safe; duplicates are
            skipped on (date, vendor, amount, source).
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
              <div className="font-medium">Drop CSV here, or click to choose</div>
              <div className="text-xs">
                Auto-detects Brex / SVB / Stripe formats · drop another file after each import
              </div>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onPick} />
            </label>
          </RoleGate>
        </CardContent>
      </Card>

      {(rows.length > 0 || warnings.length > 0) && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                {filename || "Upload preview"}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Detected as:</span>
                <Select
                  value={detectedSource ?? undefined}
                  onValueChange={(v) => switchSource(v as BankSource)}
                >
                  <SelectTrigger className="h-7 w-[220px]">
                    <SelectValue placeholder="Choose source" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {BANK_LABEL[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge
                  variant="outline"
                  className={cn(
                    confidence === "high" && "border-[hsl(var(--success))]/40 text-[hsl(var(--success))]",
                    confidence === "medium" && cn(warnBorder, warnText),
                    confidence === "low" && "border-destructive/40 text-destructive"
                  )}
                >
                  {confidence} confidence
                </Badge>
                {rows.length > 0 && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {summary.confirmed} of {summary.total} confirmed
                      {summary.unmatched > 0 && (
                        <>
                          {" · "}
                          <span className={warnText}>{summary.unmatched} unmatched</span>
                        </>
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={resetPreview}>
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
              <Button onClick={apply} disabled={importMut.isPending || summary.confirmed === 0}>
                Import {summary.confirmed} transactions
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {warnings.length > 0 && (
              <div
                className={cn(
                  "mb-4 flex items-start gap-2 rounded-md border p-3 text-xs",
                  warnBorder,
                  warnBg,
                  warnText
                )}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  {warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(summary.byCategory).length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.entries(summary.byCategory).map(([label, v]) => (
                  <Badge key={label} variant="outline" className="font-normal">
                    {label}: {v.count} · {formatCurrency(v.total, { compact: true })}
                  </Badge>
                ))}
              </div>
            )}
            {rows.length > 0 && (
              <div className="overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="w-32 text-right">Amount</TableHead>
                      <TableHead className="w-52">Category</TableHead>
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
                          <TableCell
                            className="max-w-[420px] truncate text-sm"
                            title={r.vendor}
                          >
                            {r.vendor}
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
                              onValueChange={(v) =>
                                updateRow(r.id, {
                                  category: v,
                                  confirmed: v !== "unmatched" && v !== "zba_sweep",
                                })
                              }
                            >
                              <SelectTrigger className={cn("h-8 text-xs", isUnmatched && warnBorder)}>
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
                              onCheckedChange={(c) => updateRow(r.id, { confirmed: Boolean(c) })}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};


const StatementUploadsTab = () => {
  const { data: statements = [] } = useBankStatements();
  const { data: assumptions = [] } = useAssumptions();
  const upload = useUploadStatement();
  const updateAssumption = useUpdateAssumption();
  const [busy, setBusy] = useState<BankSource | null>(null);
  const [pendingSource, setPendingSource] = useState<BankSource>("brex_primary");

  // Latest statement per bank source.
  const latestByBank = useMemo(() => {
    const m: Record<string, typeof statements[number]> = {};
    for (const s of statements) {
      const cur = m[s.bank_source];
      if (!cur || s.statement_date > cur.statement_date) m[s.bank_source] = s;
    }
    return m;
  }, [statements]);

  const assumptionByKey = useMemo(() => {
    const m: Record<string, typeof assumptions[number]> = {};
    for (const a of assumptions) m[a.key] = a;
    return m;
  }, [assumptions]);

  const handleFile = async (file: File, source: BankSource) => {
    setBusy(source);
    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      const rawText = isPdf ? await extractTextFromPdf(file) : await file.text();

      // Detect a credit card statement regardless of which account the user
      // selected — card statements never represent a cash account balance.
      if (isCardStatement(rawText)) {
        const total = isPdf
          ? extractCardTotalFromText(rawText)
          : (extractCardTotalFromCsv(rawText) ?? extractCardTotalFromText(rawText));
        if (total == null) {
          toast.error(
            "Detected a card statement, but could not read the total charges. Try a PDF export from Brex."
          );
          return;
        }
        const month = extractCardStatementMonth(rawText) ?? new Date().toISOString().slice(0, 8) + "01";
        await upload.mutateAsync({
          bank_source: "brex_card" as BankSource,
          statement_date: month,
          closing_balance: total,
          filename: file.name,
        });
        return;
      }

      // Otherwise treat it as a bank account statement.
      let closing: number | null = null;
      if (isPdf) {
        closing = extractClosingBalanceFromText(rawText);
      } else {
        closing = extractClosingBalanceFromCsv(rawText);
        if (closing == null) closing = extractClosingBalanceFromText(rawText);
      }
      if (closing == null) {
        toast.error(
          "Could not find a closing balance in the statement. Try the official bank export, or update the assumption manually."
        );
        return;
      }
      await upload.mutateAsync({
        bank_source: source,
        statement_date: new Date().toISOString().slice(0, 10),
        closing_balance: closing,
        filename: file.name,
      });
    } finally {
      setBusy(null);
    }
  };

  // All Brex card statements (one row per month).
  const cardStatements = useMemo(
    () => statements.filter((s) => s.bank_source === ("brex_card" as BankSource)),
    [statements]
  );


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verify opening balances against statements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload the most recent monthly statement (CSV or text-based PDF) for each account, or a Brex
            credit card statement. Bank statements are checked against the cash assumption (mismatch over
            $100 is flagged); card statements are checked against the matching card-payment assumption
            (mismatch over 5% is flagged). Card statements are auto-detected — pick any account here.
          </p>
          <RoleGate
            role="editor"
            fallback={
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Viewers cannot upload statements.
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Account:</span>
              <Select value={pendingSource} onValueChange={(v) => setPendingSource(v as BankSource)}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_OPTIONS.map((b) => (
                    <SelectItem key={b} value={b} className="text-xs">
                      {BANK_LABEL[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="ml-auto">
                <input
                  type="file"
                  accept=".pdf,.csv,text/csv,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f, pendingSource);
                    e.target.value = "";
                  }}
                />
                <Button asChild size="sm" disabled={busy === pendingSource}>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    {busy === pendingSource ? "Parsing…" : "Upload statement"}
                  </span>
                </Button>
              </label>
            </div>
          </RoleGate>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account verification status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Assumption</TableHead>
                <TableHead className="text-right">Statement closing</TableHead>
                <TableHead>Statement date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BANK_OPTIONS.map((src) => {
                const assumKey = BANK_TO_ASSUMPTION_KEY[src];
                const assum = assumptionByKey[assumKey];
                const stmt = latestByBank[src];
                const drift = stmt && assum ? stmt.closing_balance - Number(assum.value) : null;
                const matches = drift != null && Math.abs(drift) <= 100;
                return (
                  <TableRow key={src}>
                    <TableCell className="font-medium">{BANK_LABEL[src]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {assum ? formatCurrency(Number(assum.value), { compact: false }) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stmt ? formatCurrency(stmt.closing_balance, { compact: false }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {stmt ? format(new Date(stmt.statement_date), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      {!stmt && <Badge variant="outline" className="text-muted-foreground">No statement</Badge>}
                      {stmt && matches && (
                        <Badge variant="outline" className="border-[hsl(var(--success))]/40 text-[hsl(var(--success))]">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Matches
                        </Badge>
                      )}
                      {stmt && !matches && drift != null && (
                        <Badge variant="outline" className={cn(warnBorder, warnText)}>
                          <AlertCircle className="mr-1 h-3 w-3" /> Differs by{" "}
                          {formatCurrency(Math.abs(drift), { compact: true })}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {stmt && !matches && assum && (
                        <RoleGate role="editor">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateAssumption.mutate({ id: assum.id, value: stmt.closing_balance })
                            }
                          >
                            Update to {formatCurrency(stmt.closing_balance, { compact: true })}
                          </Button>
                        </RoleGate>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {cardStatements.map((stmt) => {
                const monthLabel = format(new Date(stmt.statement_date), "MMMM yyyy");
                const assumKey = cardAssumptionKeyForMonth(
                  stmt.statement_date,
                  assumptions.map((a) => ({ key: a.key, label: a.label ?? null }))
                );
                const assum = assumKey ? assumptionByKey[assumKey] : undefined;
                const modeled = assum ? Number(assum.value) : null;
                const driftPct =
                  modeled != null && modeled !== 0
                    ? ((stmt.closing_balance - modeled) / modeled) * 100
                    : null;
                const matches = driftPct != null && Math.abs(driftPct) <= 5;
                return (
                  <TableRow key={stmt.id}>
                    <TableCell className="font-medium">Brex Card — {monthLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {modeled != null ? formatCurrency(modeled, { compact: false }) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(stmt.closing_balance, { compact: false })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{monthLabel}</TableCell>
                    <TableCell>
                      {modeled == null && (
                        <Badge variant="outline" className="text-muted-foreground">
                          No matching assumption
                        </Badge>
                      )}
                      {modeled != null && matches && (
                        <Badge
                          variant="outline"
                          className="border-[hsl(var(--success))]/40 text-[hsl(var(--success))]"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Within 5%
                        </Badge>
                      )}
                      {modeled != null && !matches && driftPct != null && (
                        <Badge variant="outline" className={cn(warnBorder, warnText)}>
                          <AlertCircle className="mr-1 h-3 w-3" />
                          {monthLabel.split(" ")[0]} card statement{" "}
                          {formatCurrency(stmt.closing_balance, { compact: true })} — model assumes{" "}
                          {formatCurrency(modeled, { compact: true })}. Update card payment assumption?
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {modeled != null && !matches && assum && (
                        <RoleGate role="editor">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateAssumption.mutate({
                                id: assum.id,
                                value: stmt.closing_balance,
                              })
                            }
                          >
                            Update to {formatCurrency(stmt.closing_balance, { compact: true })}
                          </Button>
                        </RoleGate>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {statements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent statement uploads</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Statement date</TableHead>
                  <TableHead className="text-right">Closing balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.slice(0, 25).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">
                      <FileText className="mr-2 inline h-3 w-3 text-muted-foreground" />
                      {s.filename}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{BANK_LABEL[s.bank_source]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(s.statement_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(s.closing_balance, { compact: false })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const BankImports = () => {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="transactions" className="w-full">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="mt-6">
          <TransactionImportTab />
        </TabsContent>
        <TabsContent value="statements" className="mt-6" id="statements">
          <StatementUploadsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BankImports;
