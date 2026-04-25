import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  ListChecks,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToggleChecklistItem, useWeeklyChecklist } from "@/hooks/useBankData";
import { useLatestForecastAt } from "@/hooks/useFinanceData";
import { useOpenAlerts } from "@/hooks/useAlerts";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type ChecklistItemDef = {
  key: string;
  label: string;
  to?: string;
  hint?: string;
  auto?: "ar" | "hires" | "signoff" | "forecast";
  critical?: boolean;
};

const BASE_ITEMS: ChecklistItemDef[] = [
  {
    key: "dl_brex_primary",
    label: "Download Brex Primary transactions CSV — last 90 days",
    hint: "Brex → Transactions → Export. Re-uploading is safe; duplicates are ignored.",
  },
  { key: "dl_brex_treasury", label: "Download Brex Treasury transactions CSV — last 90 days" },
  { key: "dl_svb_checking", label: "Download SVB Analysis Checking transactions CSV — last 90 days" },
  { key: "dl_statements", label: "Download most recent monthly statements for all 5 accounts" },
  {
    key: "upload_txns",
    label: "Upload all transaction CSVs → Bank Imports (auto-detected)",
    to: "/bank-imports",
  },
  {
    key: "upload_statements",
    label: "Upload statements → Statements tab → confirm opening balances match",
    to: "/bank-imports?tab=statements",
  },
  {
    key: "upload_ar",
    label: "Upload QuickBooks A/R Aging Summary CSV → A/R Schedule",
    to: "/ar-schedule",
  },
  {
    key: "check_hiring",
    label: "Check hiring plan for new accepts or start date changes",
    to: "/future-hires",
  },
  {
    key: "ar_apply",
    label: "Hit Apply to Model on A/R Schedule",
    to: "/ar-schedule",
    auto: "ar",
  },
  {
    key: "hires_apply",
    label: "Hit Apply to Model on Future Hires",
    to: "/future-hires",
    auto: "hires",
  },
  {
    key: "update_balances",
    label: "Update the 5 bank balances in Assumptions if a statement showed a mismatch",
    to: "/assumptions",
  },
  {
    key: "generate_forecast",
    label: "Go to Dashboard → hit Generate Forecast",
    to: "/?focus=generate",
    auto: "forecast",
  },
  { key: "review", label: "Review numbers — burn, headroom vs $15M floor, red/amber alerts" },
  { key: "signoff", label: "Sign off prior week", auto: "signoff" },
];

const CRITICAL_ITEM: ChecklistItemDef = {
  key: "resolve_critical_alerts",
  label: "Resolve or dismiss all critical alerts",
  to: "/#alerts",
  critical: true,
};

const mondayOf = (d: Date): string => {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};

const STALE_MS = 6 * 24 * 60 * 60 * 1000;
const COMPLETED_LS_KEY = "checklist_completed_week";

export const MondayChecklist = () => {
  const { user } = useAuth();
  const week = useMemo(() => mondayOf(new Date()), []);
  const { data: items = [] } = useWeeklyChecklist(week);
  const { data: lastForecastAt } = useLatestForecastAt();
  const { data: openAlerts = [] } = useOpenAlerts();
  const toggle = useToggleChecklistItem();

  const isMonday = new Date().getDay() === 1;
  const stale =
    !lastForecastAt || Date.now() - lastForecastAt.getTime() > STALE_MS;
  const shouldShow = isMonday || stale;

  // Check completion flag in localStorage. If the stored Monday matches this
  // week's Monday, the checklist stays hidden until next Monday. If it's an
  // older date, clear it so this week's checklist shows again.
  const [completedWeek, setCompletedWeek] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(COMPLETED_LS_KEY);
      if (!stored) return null;
      if (stored === week) return stored;
      // Stale flag from a previous week — clear it.
      window.localStorage.removeItem(COMPLETED_LS_KEY);
      return null;
    } catch {
      return null;
    }
  });

  const hasCriticalAlerts = openAlerts.some((a) => a.severity === "critical");
  const activeItems = useMemo(
    () => (hasCriticalAlerts ? [...BASE_ITEMS, CRITICAL_ITEM] : BASE_ITEMS),
    [hasCriticalAlerts],
  );

  // Server state lookup
  const serverDone = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const i of items) m[i.item_key] = i.completed;
    return m;
  }, [items]);

  // localStorage mirror for instant restore on refresh
  const lsKey = `mondayChecklist:${week}`;
  const [localDone, setLocalDone] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(lsKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  // Merge: server is the source of truth once it loads; mirror to localStorage.
  const completed: Record<string, boolean> = useMemo(() => {
    const merged: Record<string, boolean> = { ...localDone };
    for (const k of Object.keys(serverDone)) merged[k] = serverDone[k];
    return merged;
  }, [localDone, serverDone]);

  useEffect(() => {
    try {
      window.localStorage.setItem(lsKey, JSON.stringify(completed));
    } catch {
      // ignore quota / private mode
    }
  }, [completed, lsKey]);

  const completedCount = activeItems.filter((i) => completed[i.key]).length;
  const total = activeItems.length;
  const allDone = completedCount === total;

  // Persist completion flag the moment all items are checked.
  useEffect(() => {
    if (allDone && completedWeek !== week) {
      try {
        window.localStorage.setItem(COMPLETED_LS_KEY, week);
      } catch {
        // ignore
      }
      setCompletedWeek(week);
    }
  }, [allDone, completedWeek, week]);

  // Hide entirely on page load if this week was already completed.
  if (completedWeek === week && !allDone) return null;

  if (!shouldShow) return null;


  const handleToggle = (key: string, next: boolean) => {
    // Optimistic local update so UX feels instant even if the server is slow.
    setLocalDone((prev) => ({ ...prev, [key]: next }));
    toggle.mutate({
      week_start_date: week,
      item_key: key,
      completed: next,
      email: user?.email ?? null,
    });
  };

  // Collapsed success banner — shown immediately on completion. On the next
  // page load the checklist is hidden entirely (handled above) until the
  // following Monday at midnight.
  if (allDone) {
    return (
      <Card className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
          <span className="text-sm font-medium text-[hsl(var(--success))]">
            Model updated — Week of {format(new Date(week), "MMM d, yyyy")}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Monday Morning Checklist</CardTitle>
          <Badge variant="outline" className="font-normal">
            Week of {format(new Date(week), "MMM d")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {completedCount} / {total}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {activeItems.map((item, idx) => {
          const done = !!completed[item.key];
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-start gap-3 rounded-md p-2 text-sm transition-colors hover:bg-muted/40",
                done && "text-muted-foreground",
                item.critical &&
                  !done &&
                  "border border-destructive/40 bg-destructive/5 hover:bg-destructive/10",
              )}
            >
              <Checkbox
                checked={done}
                onCheckedChange={(c) => handleToggle(item.key, Boolean(c))}
                className="mt-0.5"
                aria-label={item.label}
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-mono text-muted-foreground">
                    {idx + 1}.
                  </span>
                  {item.to ? (
                    <Link
                      to={item.to}
                      className={cn(
                        "inline-flex items-center gap-1 hover:underline",
                        done && "line-through",
                        item.critical && !done && "font-medium text-destructive",
                      )}
                    >
                      {item.label}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        done && "line-through",
                        item.critical && !done && "font-medium text-destructive",
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                  {item.auto && !done && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      auto
                    </Badge>
                  )}
                  {item.critical && !done && (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  )}
                </div>
                {item.hint && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{item.hint}</div>
                )}
              </div>
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
