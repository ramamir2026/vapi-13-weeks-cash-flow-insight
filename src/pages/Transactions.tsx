import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  useBankTransactions,
  useUpdateBankTransaction,
  useUpsertCategoryRule,
} from "@/hooks/useBankData";
import { BANK_LABEL, type BankSource } from "@/lib/bankParsers/types";
import { RoleGate } from "@/components/RoleGate";

const CATEGORY_OPTIONS = [
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

const Transactions = () => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState<BankSource | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [vendor, setVendor] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");

  const filters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      source: source === "all" ? undefined : source,
      category: category === "all" ? undefined : category,
      vendorContains: vendor || undefined,
      minAmount: minAmt ? Number(minAmt) : undefined,
      maxAmount: maxAmt ? Number(maxAmt) : undefined,
    }),
    [from, to, source, category, vendor, minAmt, maxAmt]
  );

  const { data: txns, isLoading } = useBankTransactions(filters);
  const update = useUpdateBankTransaction();
  const upsertRule = useUpsertCategoryRule();

  const handleCategoryChange = (id: string, vendorName: string, src: BankSource, next: string) => {
    update.mutate({ id, category: next });
    // Save the new mapping as a rule so future imports auto-apply it.
    upsertRule.mutate({
      vendor_contains: vendorName.slice(0, 24),
      category: next,
      bank_source: src,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Bank</Label>
              <Select value={source} onValueChange={(v) => setSource(v as BankSource | "all")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All banks</SelectItem>
                  {BANK_OPTIONS.map((b) => (
                    <SelectItem key={b} value={b}>{BANK_LABEL[b]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Vendor contains</Label>
              <Input placeholder="search" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Min $</Label>
              <Input type="number" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Max $</Label>
              <Input type="number" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Transactions {txns && <span className="text-sm text-muted-foreground">({txns.length})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72" />
          ) : !txns || txns.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              No transactions match these filters.
            </div>
          ) : (
            <div className="overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-44">Bank</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                    <TableHead className="w-44">Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txns.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                        {format(new Date(t.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="font-normal">{BANK_LABEL[t.bank_source]}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[420px] truncate text-sm" title={t.vendor}>
                        {t.vendor}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", Number(t.amount) < 0 ? "text-destructive" : "text-foreground")}>
                        {Number(t.amount) < 0 ? "(" : ""}
                        {formatCurrency(Math.abs(Number(t.amount)), { compact: false })}
                        {Number(t.amount) < 0 ? ")" : ""}
                      </TableCell>
                      <TableCell>
                        <RoleGate
                          role="editor"
                          fallback={<span className="text-xs text-muted-foreground">{t.category}</span>}
                        >
                          <Select
                            value={t.category}
                            onValueChange={(v) => handleCategoryChange(t.id, t.vendor, t.bank_source, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORY_OPTIONS.map((c) => (
                                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </RoleGate>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Transactions;
