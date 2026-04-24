import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLatestSnapshotWeeks, useAllWeeklyActuals } from "@/hooks/useVariance";
import { useFutureHires } from "@/hooks/useFinanceData";
import { generateInsights, joinWeeks } from "@/lib/varianceAnalysis";
import { WeeklyVarianceTable } from "@/components/variance/WeeklyVarianceTable";
import { TrendCharts } from "@/components/variance/TrendCharts";
import { InsightsPanel } from "@/components/variance/InsightsPanel";

const VarianceInsights = () => {
  const snap = useLatestSnapshotWeeks();
  const acts = useAllWeeklyActuals();
  const hiresQ = useFutureHires();

  const joined = useMemo(() => {
    if (!snap.data?.weeks || !acts.data) return [];
    return joinWeeks(snap.data.weeks, acts.data);
  }, [snap.data, acts.data]);

  const insights = useMemo(() => {
    const hires = (hiresQ.data ?? []).map((h) => ({ name: h.name, start_date: h.start_date }));
    return generateInsights(joined, hires);
  }, [joined, hiresQ.data]);

  const loading = snap.isLoading || acts.isLoading;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!snap.data?.snapshotId) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Save a forecast snapshot from the Dashboard to start tracking variance.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Variance &amp; Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comparing modeled vs actual numbers for completed weeks
          {snap.data.label ? ` · snapshot: ${snap.data.label}` : ""}.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Weekly variance</h2>
        <WeeklyVarianceTable weeks={joined} />
      </section>

      {joined.length > 0 && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Trends</h2>
            <TrendCharts weeks={joined} />
          </section>

          <section>
            <InsightsPanel insights={insights} />
          </section>
        </>
      )}
    </div>
  );
};

export default VarianceInsights;
