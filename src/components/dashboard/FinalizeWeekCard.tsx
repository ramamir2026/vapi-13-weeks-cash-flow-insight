import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send, Loader2 } from "lucide-react";
import {
  useFinalizeAndSendWeeklyReport,
  useWeeklyReportState,
} from "@/hooks/useFinanceData";
import { RoleGate } from "@/components/RoleGate";

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function FinalizeWeekStatus() {
  const { data } = useWeeklyReportState();
  let label = "This week: not finalized";
  let color = "text-muted-foreground";
  if (data?.sent_at) {
    label = `This week: report sent ${fmtRelative(data.sent_at)}${data.sent_via ? ` (${data.sent_via})` : ""}`;
    color = "text-[hsl(var(--success))]";
  } else if (data?.finalized) {
    label = "This week: finalized (report not yet sent)";
    color = "text-[hsl(var(--warning))]";
  }
  return <span className={`text-xs ${color}`}>{label}</span>;
}

export function FinalizeWeekButton() {
  const { data: state } = useWeeklyReportState();
  const finalize = useFinalizeAndSendWeeklyReport();
  const [open, setOpen] = useState(false);
  const alreadySent = !!state?.sent_at;

  const handleConfirm = () => {
    setOpen(false);
    finalize.mutate();
  };

  return (
    <RoleGate role="editor">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <Button
          variant={alreadySent ? "outline" : "default"}
          onClick={() => setOpen(true)}
          disabled={finalize.isPending}
        >
          {finalize.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          {alreadySent ? "Re-send weekly report" : "Finalize & send weekly report"}
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {alreadySent
                ? "Re-send this week's report to Slack?"
                : "Send this week's report to Slack now?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alreadySent ? (
                <>
                  A report for this week was already sent
                  {state?.sent_at ? ` ${fmtRelative(state.sent_at)}` : ""}. Re-sending will post a
                  new message to #cash-flow. Continue?
                </>
              ) : (
                <>
                  This will mark the week as finalized, generate the latest forecast snapshot, and
                  post the cash flow report to Slack (email fallback). This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {alreadySent ? "Yes, re-send" : "Finalize & send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RoleGate>
  );
}
