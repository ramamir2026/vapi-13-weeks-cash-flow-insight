import { useState, useEffect, useMemo } from "react";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useAssumptions, useUpdateAssumption, type Assumption } from "@/hooks/useFinanceData";

type Flag = "yellow" | "red" | undefined;

interface RowDef {
  key: string;
  flag?: Flag;
}

interface SectionDef {
  id: string;
  title: string;
  subtitle?: string;
  rows: RowDef[];
  showTotal?: boolean; // Opening Cash auto-sum
}

const SECTIONS: SectionDef[] = [
  {
    id: "opening-cash",
    title: "Opening Cash Balance",
    subtitle: "As of Apr 20, 2026",
    showTotal: true,
    rows: [
      { key: "cash_svb_mm" },
      { key: "cash_brex_treasury" },
      { key: "cash_brex_primary" },
      { key: "cash_svb_checking" },
      { key: "cash_stripe_clearing" },
    ],
  },
  {
    id: "inflows",
    title: "Inflows",
    rows: [
      { key: "stripe_daily_rate" },
      { key: "stripe_growth_pct" },
      { key: "enterprise_ach_weekly" },
    ],
  },
  {
    id: "payroll",
    title: "Payroll",
    rows: [{ key: "payroll_semi_monthly" }, { key: "payroll_processing_fee" }],
  },
  {
    id: "ai-cogs",
    title: "AI COGS Vendors",
    rows: [
      { key: "cogs_anthropic" },
      { key: "cogs_azure" },
      { key: "cogs_openai" },
      { key: "cogs_elevenlabs" },
      { key: "cogs_deepgram" },
      { key: "cogs_pump_aws" },
      { key: "cogs_twilio" },
      { key: "cogs_other" },
    ],
  },
  {
    id: "brex",
    title: "Brex Card Payments",
    subtitle: "Estimates",
    rows: [
      { key: "brex_w2", flag: "yellow" },
      { key: "brex_w7", flag: "yellow" },
      { key: "brex_w11", flag: "yellow" },
    ],
  },
  {
    id: "opex",
    title: "Operating Expenses",
    rows: [
      { key: "opex_sm" },
      { key: "opex_software" },
      { key: "opex_legal" },
      { key: "opex_deel" },
      { key: "opex_hr_te" },
      { key: "opex_recruiting", flag: "yellow" },
      { key: "rent_may_sep" },
      { key: "rent_oct_plus" },
      { key: "opex_ga" },
    ],
  },
  {
    id: "one-time",
    title: "One-Time Payments",
    rows: [{ key: "one_time_vendor_w2", flag: "yellow" }],
  },
  {
    id: "threshold",
    title: "Cash Threshold / Alert",
    rows: [{ key: "min_cash_threshold", flag: "red" }],
  },
  {
    id: "ar-delay",
    title: "A/R Collection Delay Scenario",
    rows: [{ key: "ar_delay_days" }],
  },
];

const CASH_KEYS = SECTIONS[0].rows.map((r) => r.key);

interface AssumptionRowProps {
  a: Assumption;
  flag?: Flag;
  onValueChange?: (key: string, value: number) => void;
}

const AssumptionRow = ({ a, flag, onValueChange }: AssumptionRowProps) => {
  const [value, setValue] = useState(String(a.value));
  const update = useUpdateAssumption();

  useEffect(() => {
    setValue(String(a.value));
  }, [a.value]);

  const handleChange = (v: string) => {
    setValue(v);
    const num = parseFloat(v);
    if (!isNaN(num)) onValueChange?.(a.key, num);
  };

  const handleBlur = () => {
    const num = parseFloat(value);
    if (isNaN(num) || num === Number(a.value)) return;
    update.mutate({ id: a.id, value: num });
  };

  const inputClass = cn(
    "text-right tabular-nums w-[200px] ml-auto",
    flag === "yellow" && "bg-[hsl(var(--estimate-yellow))] border-[hsl(var(--estimate-yellow-fg))]",
    flag === "red" && "border-[hsl(var(--warn-amber))] border-2",
    !flag && "bg-[hsl(var(--input-blue))] border-[hsl(var(--input-blue-fg))]"
  );

  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border py-3 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <Label htmlFor={a.id} className="text-sm font-medium">
          {a.label}
        </Label>
        {a.notes && <p className="mt-0.5 text-xs text-muted-foreground">{a.notes}</p>}
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <Input
          id={a.id}
          type="number"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={inputClass}
        />
        {a.unit && <span className="w-8 shrink-0 text-sm text-muted-foreground">{a.unit}</span>}
      </div>
    </div>
  );
};

export default function Assumptions() {
  const { data, isLoading } = useAssumptions();
  const [cashState, setCashState] = useState<Record<string, number>>({});

  // Build map by key
  const byKey = useMemo(() => {
    const m: Record<string, Assumption> = {};
    (data ?? []).forEach((a) => (m[a.key] = a));
    return m;
  }, [data]);

  // Seed cash state from DB
  useEffect(() => {
    if (!data) return;
    const seed: Record<string, number> = {};
    for (const k of CASH_KEYS) seed[k] = Number(byKey[k]?.value ?? 0);
    setCashState(seed);
  }, [data, byKey]);

  const cashTotal = useMemo(
    () => CASH_KEYS.reduce((s, k) => s + (cashState[k] ?? 0), 0),
    [cashState]
  );

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  const handleCashChange = (key: string, v: number) => {
    setCashState((prev) => ({ ...prev, [key]: v }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--input-blue-fg))]/30 bg-[hsl(var(--input-blue))] px-4 py-3 text-sm text-[hsl(var(--input-blue-fg))]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Changes here take effect when you click <strong>Generate Forecast</strong> on the Dashboard.
        </p>
      </div>

      {SECTIONS.map((section) => {
        const rows = section.rows.filter((r) => byKey[r.key]);
        if (rows.length === 0) return null;

        return (
          <Card key={section.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{section.title}</CardTitle>
              {section.subtitle && (
                <p className="text-xs text-muted-foreground">{section.subtitle}</p>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {rows.map((r) => (
                <AssumptionRow
                  key={r.key}
                  a={byKey[r.key]}
                  flag={r.flag}
                  onValueChange={section.showTotal ? handleCashChange : undefined}
                />
              ))}
              {section.showTotal && (
                <div className="grid grid-cols-1 gap-3 border-t-2 border-border py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <Label className="text-sm font-bold">TOTAL</Label>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <div className="w-[200px] rounded-md bg-muted px-3 py-2 text-right text-sm font-bold tabular-nums">
                      {formatCurrency(cashTotal)}
                    </div>
                    <span className="w-8 shrink-0 text-sm text-muted-foreground">$</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
