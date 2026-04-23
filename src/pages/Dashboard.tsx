import { useMemo } from "react";
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
import { buildAssumptionMap, buildForecast } from "@/lib/forecast";
import { exportForecastToExcel } from "@/lib/exportExcel";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ForecastGrid } from "@/components/forecast/ForecastGrid";
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
  const updateActual = useUpdateWeeklyActual();
  const saveSnapshot = useSaveForecastSnapshot();

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

  const handleGenerate = () => {
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
  };

  const handleDownload = () => {
    exportForecastToExcel(forecast, actualsData?.map ?? {});
  };

  return (
    <div className="space-y-6">
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
          <Button onClick={handleGenerate} disabled={saveSnapshot.isPending}>
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
      />
    </div>
  );
}
