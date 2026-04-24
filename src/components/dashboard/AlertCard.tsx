import { useState } from "react";
import { AlertTriangle, AlertOctagon, Info, Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useApplyAlertSuggestion,
  useDismissAlert,
  useReopenAlert,
  type ModelAlert,
} from "@/hooks/useAlerts";
import { RoleGate } from "@/components/RoleGate";

const DISMISS_REASONS = [
  "Acknowledged",
  "One-time",
  "Will fix next cycle",
  "Updating assumption",
] as const;

const SEVERITY_STYLE = {
  critical: {
    border: "border-destructive/40",
    bg: "bg-destructive/5",
    icon: AlertOctagon,
    iconClass: "text-destructive",
  },
  warning: {
    border: "border-[hsl(var(--warning))]/40",
    bg: "bg-[hsl(var(--warning))]/5",
    icon: AlertTriangle,
    iconClass: "text-[hsl(var(--warning))]",
  },
  info: {
    border: "border-border",
    bg: "bg-muted/30",
    icon: Info,
    iconClass: "text-muted-foreground",
  },
};

interface Props {
  alert: ModelAlert;
  variant?: "open" | "dismissed";
}

export const AlertCard = ({ alert, variant = "open" }: Props) => {
  const dismiss = useDismissAlert();
  const apply = useApplyAlertSuggestion();
  const reopen = useReopenAlert();
  const [reason, setReason] = useState<string>(DISMISS_REASONS[0]);
  const [open, setOpen] = useState(false);

  const style = SEVERITY_STYLE[alert.severity];
  const Icon = style.icon;

  const handleApply = () => {
    if (alert.suggested_value == null) return;
    apply.mutate({
      alertId: alert.id,
      assumptionKey: alert.assumption_key,
      newValue: Number(alert.suggested_value),
    });
  };

  const handleDismiss = () => {
    dismiss.mutate({ id: alert.id, reason });
    setOpen(false);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        style.border,
        style.bg
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", style.iconClass)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{alert.title}</div>
        {alert.detail && (
          <div className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</div>
        )}
        {variant === "dismissed" && alert.dismissed_by && (
          <div className="mt-1 text-xs text-muted-foreground">
            {alert.auto_resolved
              ? "Auto-resolved"
              : `${alert.status === "resolved" ? "Resolved" : "Dismissed"} by ${alert.dismissed_by}`}
            {alert.dismissed_at &&
              ` · ${new Date(alert.dismissed_at).toLocaleDateString()}`}
            {alert.dismissal_reason && ` · ${alert.dismissal_reason}`}
          </div>
        )}
      </div>
      {variant === "open" && (
        <div className="flex shrink-0 items-center gap-1">
          {alert.suggested_value != null && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleApply}
              disabled={apply.isPending}
              className="h-7 text-xs"
            >
              <Check className="mr-1 h-3 w-3" /> Apply
            </Button>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 text-xs">
                <X className="mr-1 h-3 w-3" /> Dismiss
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2">
              <div className="text-xs font-medium">Reason</div>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISMISS_REASONS.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="w-full"
                onClick={handleDismiss}
                disabled={dismiss.isPending}
              >
                Dismiss alert
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      )}
      {variant === "dismissed" && alert.status === "dismissed" && (
        <RoleGate role="approver">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => reopen.mutate(alert.id)}
            disabled={reopen.isPending}
            className="h-7 shrink-0 text-xs"
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Reopen
          </Button>
        </RoleGate>
      )}
    </div>
  );
};
