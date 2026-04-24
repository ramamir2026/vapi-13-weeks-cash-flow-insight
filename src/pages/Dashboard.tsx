import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowDownRight, ArrowUpRight, Calendar, Download, Flame, RefreshCw, Wallet } from "lucide-react";
import {
  useArEntries,
  useArWeeklyOverride,
  useAssumptions,
  useFutureHires,
  useHirePayrollOverride,
  useSaveForecastSnapshot,
  useUpdateWeeklyActual,
  useWeeklyActuals,
} from "@/hooks/useFinanceData";
import {
  useIsApprover,
  useSignOffWeek,
  useUnsignWeek,
  useWeekSignoffs,
} from "@/hooks/useControls";
import { buildAssumptionMap, buildForecast } from "@/lib/forecast";
import { exportForecastToExcel } from "@/lib/exportExcel";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ForecastGrid } from "@/components/forecast/ForecastGrid";
import { BalanceVerificationBanner } from "@/components/dashboard/BalanceVerificationBanner";
import { MondayChecklist } from "@/components/dashboard/MondayChecklist";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { useAutoCheckChecklistItem } from "@/hooks/useBankData";
import { useAuth } from "@/hooks/useAuth";
import { useCreateAlerts, useSaveVarianceSnapshots } from "@/hooks/useAlerts";
import { detectAlerts, type VarianceTxn } from "@/lib/variance";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const Kpi = ({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "positive" | "negative" | "warning";
}) => {
  const toneClass = {
    default: "bg-accent text-accent-foreground",
    positive: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    negative: "bg-destructive/10 text-destructive",
    warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-6">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
};

export default function Dashboard() {
  const { data: assumptions, isLoading: aLoading } = useAssumptions();
  const { data: arEntries, isLoading: arLoading } = useArEntries();
  const { data: hires, isLoading: hLoading } = useFutureHires();
  const { data: actualsData } = useWeeklyActuals();
  const { data: arOverride } = useArWeeklyOverride();
  const { data: hireOverride } = useHirePayrollOverride();
  const { data: signoffsList } = useWeekSignoffs();
  const isApprover = useIsApprover();
  const signOff = useSignOffWeek();
  const unsign = useUnsignWeek();
  const updateActual = useUpdateWeeklyActual();
  const saveSnapshot = useSaveForecastSnapshot();
  const createAlerts = useCreateAlerts();
  const saveVarianceSnapshots = useSaveVarianceSnapshots();
  const autoCheck = useAutoCheckChecklistItem();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const generateBtnRef = useRef<HTMLButtonElement>(null);

  // Briefly highlight the Generate Forecast button when arriving with ?focus=generate.
  useEffect(() => {
    if (searchParams.get("focus") !== "generate") return;
    const el = generateBtnRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary", "ring-offset-2");
    const timer = window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const signoffMap = useMemo(() => {
    const m: Record<string, NonNullable<typeof signoffsList>[number]> = {};
    for (const s of signoffsList ?? []) m[s.week_start_date] = s;
    return m;
  }, [signoffsList]);

  const loading = aLoading || arLoading || hLoading;

  const forecast = useMemo(() => {
    if (!assumptions) return null;
    const map = buildAssumptionMap(assumptions);
    return buildForecast(
      map,
      arEntries?.map((e) => ({
        expected_collection_date: e.expected_collection_date,
        invoice_amount: Number(e.invoice_amount),
        status: e.status,
      })) ?? [],
      hires?.map((h) => ({
        start_date: h.start_date,
        annual_salary: Number(h.annual_salary),
      })) ?? [],
      13,
      undefined,
      arOverride ? { weeks: arOverride.weeks, delay_days: arOverride.delay_days } : null,
      hireOverride ? { weeks: hireOverride.weeks } : null
    );
  }, [assumptions, arEntries, hires, arOverride, hireOverride]);

  if (loading || !forecast) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  const openingCash = forecast.weeks[0]?.openingBalance ?? 0;
  const monthlyBurn = forecast.monthlyBurn;
  const runwayMonths = forecast.runwayMonths;
  const ending = forecast.endingBalance;

  const handleGenerate = async () => {
    const rows = forecast.weeks.map((w) => ({
      week_index: w.weekIndex,
      week_start_date: w.weekStartDate.toISOString().slice(0, 10),
      opening_balance: w.openingBalance,
      stripe_revenue: w.stripeRevenue,
      enterprise_revenue: w.enterpriseRevenue,
      ar_collections: w.arCollections,
      payroll: w.payroll,
      cogs: w.cogsTotal,
      card_payments: w.brexCard,
      rent: w.rent,
      opex: w.opexTotal,
      net_change: w.netChange,
      closing_balance: w.closingBalance,
      burn: Math.max(0, -w.netChange),
      runway_weeks: w.runwayMonths != null ? w.runwayMonths * 4.333 : null,
    }));
    saveSnapshot.mutate(rows);

    // Run variance detection against actuals for the prior week
    if (!assumptions || !forecast.weeks.length) return;
    const w0 = forecast.weeks[0];
    const weekStartIso = w0.weekStartDate.toISOString().slice(0, 10);
    const weekEnd = new Date(w0.weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [{ data: txns }, { data: rules }, { data: stmts }] = await Promise.all([
      supabase
        .from("bank_transactions")
        .select("date, vendor, amount, category, bank_source")
        .gte("date", weekStartIso)
        .lt("date", weekEnd.toISOString().slice(0, 10)),
      supabase.from("bank_category_rules").select("vendor_contains"),
      supabase
        .from("bank_statements")
        .select("bank_source, closing_balance, statement_date")
        .order("statement_date", { ascending: false })
        .limit(50),
    ]);

    const assumptionMap: Record<string, number> = {};
    for (const a of assumptions) assumptionMap[a.key] = Number(a.value);

    const cashKeys = [
      "cash_svb_mm",
      "cash_brex_treasury",
      "cash_brex_primary",
      "cash_svb_checking",
      "cash_stripe_clearing",
    ];
    const modeledOpening = cashKeys.reduce((s, k) => s + (assumptionMap[k] ?? 0), 0);
    const latestPerSource = new Map<string, number>();
    for (const s of stmts ?? []) {
      if (!latestPerSource.has(s.bank_source)) {
        latestPerSource.set(s.bank_source, Number(s.closing_balance));
      }
    }
    const verifiedOpening = Array.from(latestPerSource.values()).reduce((s, v) => s + v, 0);

    const candidates = detectAlerts({
      weekStartDate: weekStartIso,
      assumptions: assumptionMap,
      txns: (txns ?? []) as VarianceTxn[],
      bankCategoryRules: (rules ?? []) as { vendor_contains: string }[],
      modeledAr: w0.arCollections,
      modeledOpeningBalance: modeledOpening,
      verifiedOpeningBalance: verifiedOpening,
    });

    await createAlerts.mutateAsync({ weekStartDate: weekStartIso, candidates });

    // Snapshot variance for drift dots
    const actualByCategory: Record<string, number> = {};
    for (const t of (txns ?? []) as VarianceTxn[]) {
      actualByCategory[t.category] = (actualByCategory[t.category] ?? 0) + Math.abs(Number(t.amount));
    }
    const snapshotRows = [
      { assumption_key: "payroll_semi_monthly", modeled: w0.payroll, actual: actualByCategory.payroll ?? 0 },
      { assumption_key: "ar_collections_weekly", modeled: w0.arCollections, actual: actualByCategory.ar_collections ?? 0 },
      { assumption_key: "stripe_daily_rate", modeled: w0.stripeRevenue, actual: actualByCategory.stripe_revenue ?? 0 },
      { assumption_key: "enterprise_ach_weekly", modeled: w0.enterpriseRevenue, actual: actualByCategory.enterprise_revenue ?? 0 },
      { assumption_key: "opening_cash_balance", modeled: modeledOpening, actual: verifiedOpening },
    ].map((r) => ({ ...r, week_start_date: weekStartIso }));
    saveVarianceSnapshots.mutate(snapshotRows);
  };

  const handleDownload = () => {
    void exportForecastToExcel(forecast, actualsData?.map ?? {});
  };

  return (
    <div className="space-y-6">
      <MondayChecklist />
      <BalanceVerificationBanner />
      <AlertsPanel />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">13-Week Cash Flow Forecast</h2>
          <p className="text-sm text-muted-foreground">
            Editable actuals · Live recompute from assumptions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download Excel
          </Button>
          <Button
            ref={generateBtnRef}
            onClick={handleGenerate}
            disabled={saveSnapshot.isPending}
            className="transition-shadow"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", saveSnapshot.isPending && "animate-spin")} />
            Generate Forecast
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Current Cash"
          value={formatCurrency(openingCash, { compact: true })}
          sub="Opening balance W1"
          icon={Wallet}
        />
        <Kpi
          label="Net Monthly Burn"
          value={monthlyBurn == null ? "CF Positive" : formatCurrency(monthlyBurn, { compact: true })}
          sub="4-wk trailing avg"
          icon={Flame}
          tone={monthlyBurn == null ? "positive" : "warning"}
        />
        <Kpi
          label="Runway"
          value={runwayMonths == null ? "∞" : `${formatNumber(runwayMonths)} mo`}
          sub={forecast.cashOutDate ? `Cash-out ${forecast.cashOutDate}` : "Cash positive"}
          icon={Calendar}
          tone={runwayMonths != null && runwayMonths < 12 ? "negative" : "default"}
        />
        <Kpi
          label="Ending Balance (W13)"
          value={formatCurrency(ending, { compact: true })}
          sub={ending >= openingCash ? "Growing" : "Declining"}
          icon={ending >= openingCash ? ArrowUpRight : ArrowDownRight}
          tone={ending >= openingCash ? "positive" : "negative"}
        />
      </div>

      <ForecastGrid
        forecast={forecast}
        actuals={actualsData?.map ?? {}}
        onActualChange={(rowKey, value) => updateActual.mutate({ rowKey, value })}
        signoffs={signoffMap}
        isApprover={isApprover}
        onSignOff={(iso) =>
          signOff.mutate(iso, {
            onSuccess: () => {
              autoCheck.mutate({ itemKey: "signoff", email: user?.email ?? null });
            },
          })
        }
        onUnsign={(iso) => unsign.mutate(iso)}
      />
    </div>
  );
}
