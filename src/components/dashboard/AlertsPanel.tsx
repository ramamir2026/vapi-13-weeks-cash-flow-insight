import { useState } from "react";
import { ChevronDown, ChevronRight, AlertOctagon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useDismissedAlerts, useOpenAlerts, type ModelAlert } from "@/hooks/useAlerts";
import { AlertCard } from "./AlertCard";

const groupBySeverity = (alerts: ModelAlert[]) => ({
  critical: alerts.filter((a) => a.severity === "critical"),
  warning: alerts.filter((a) => a.severity === "warning"),
  info: alerts.filter((a) => a.severity === "info"),
});

export const AlertsPanel = () => {
  const { data: open = [], isLoading } = useOpenAlerts();
  const { data: dismissed = [] } = useDismissedAlerts();
  const [warningOpen, setWarningOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (isLoading) return null;
  const { critical, warning, info } = groupBySeverity(open);

  if (open.length === 0 && dismissed.length === 0) return null;

  return (
    <div className="space-y-3">
      {critical.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertOctagon className="h-4 w-4" />
              {critical.length} critical alert{critical.length === 1 ? "" : "s"}
            </div>
            <div className="space-y-2">
              {critical.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {warning.length > 0 && (
        <Card>
          <Collapsible open={warningOpen} onOpenChange={setWarningOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between p-4 text-left">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {warningOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Warnings
                  <Badge
                    variant="outline"
                    className="border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
                  >
                    {warning.length}
                  </Badge>
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 px-4 pb-4">
                {warning.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {info.length > 0 && (
        <Card>
          <Collapsible open={infoOpen} onOpenChange={setInfoOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between p-4 text-left">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {infoOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Suggestions
                  <Badge variant="outline">{info.length}</Badge>
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 px-4 pb-4">
                {info.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {dismissed.length > 0 && (
        <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              {archiveOpen ? (
                <ChevronDown className="mr-1 h-3 w-3" />
              ) : (
                <ChevronRight className="mr-1 h-3 w-3" />
              )}
              View {dismissed.length} dismissed alert{dismissed.length === 1 ? "" : "s"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2">
              <CardContent className="space-y-2 p-4">
                {dismissed.map((a) => (
                  <AlertCard key={a.id} alert={a} variant="dismissed" />
                ))}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
