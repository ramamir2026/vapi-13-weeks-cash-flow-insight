import { useMemo } from "react";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useToggleChecklistItem, useWeeklyChecklist } from "@/hooks/useBankData";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// Checklist items for the Monday close. Keys are stable; labels can be edited.
const CHECKLIST_ITEMS = [
  { key: "dl_brex_primary", label: "Download Brex Primary transactions CSV — last 90 days" },
  { key: "dl_brex_treasury", label: "Download Brex Treasury transactions CSV — last 90 days" },
  { key: "dl_svb_checking", label: "Download SVB Analysis Checking transactions CSV — last 90 days" },
  { key: "dl_statements", label: "Download most recent monthly statements for all 5 accounts" },
  { key: "upload_txns", label: "Upload all transaction CSVs → Bank Imports (auto-detected, duplicate-safe)" },
  { key: "upload_statements", label: "Upload statements → Bank Imports → confirm opening balances match" },
  { key: "dl_qb_ar", label: "Download QuickBooks A/R Aging Summary CSV → upload to A/R Schedule" },
  { key: "check_hiring", label: "Check hiring plan for new accepts or start date changes" },
  { key: "ar_apply", label: "Hit Apply to Model on A/R Schedule" },
  { key: "hires_apply", label: "Update Future Hires if any changes → hit Apply to Model" },
  { key: "update_balances", label: "Dashboard → update the 5 bank balances in Assumptions if flagged" },
  { key: "generate_forecast", label: "Hit Generate Forecast" },
  { key: "review", label: "Review numbers — burn, headroom vs $15M floor, ⚠ flags" },
  { key: "signoff", label: "Sign off prior week" },
];

const mondayOf = (d: Date) => {
  const x = new Date(d);
  const day = x.getUTCDay();
  const diff = (day + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  return x.toISOString().slice(0, 10);
};

export const WeeklyChecklist = () => {
  const { user } = useAuth();
  const week = useMemo(() => mondayOf(new Date()), []);
  const { data: items = [] } = useWeeklyChecklist(week);
  const toggle = useToggleChecklistItem();

  const stateByKey = useMemo(() => {
    const m: Record<string, typeof items[number]> = {};
    for (const i of items) m[i.item_key] = i;
    return m;
  }, [items]);

  const completed = items.filter((i) => i.completed).length;
  const total = CHECKLIST_ITEMS.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Monday close checklist
        </CardTitle>
        <Badge variant="outline" className="font-normal">
          Week of {format(new Date(week), "MMM d")} · {completed} / {total}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-1">
        {CHECKLIST_ITEMS.map((item) => {
          const s = stateByKey[item.key];
          const done = !!s?.completed;
          return (
            <label
              key={item.key}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm transition-colors hover:bg-muted/40",
                done && "text-muted-foreground"
              )}
            >
              <Checkbox
                checked={done}
                onCheckedChange={(c) =>
                  toggle.mutate({
                    week_start_date: week,
                    item_key: item.key,
                    completed: Boolean(c),
                    email: user?.email ?? null,
                  })
                }
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className={cn(done && "line-through")}>{item.label}</div>
                {done && s?.completed_by_email && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    by {s.completed_by_email}
                    {s.completed_at && ` · ${format(new Date(s.completed_at), "MMM d, h:mm a")}`}
                  </div>
                )}
              </div>
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40" />
              )}
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
};
