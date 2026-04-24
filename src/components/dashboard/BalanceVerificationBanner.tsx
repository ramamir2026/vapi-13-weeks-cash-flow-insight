import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAssumptions } from "@/hooks/useFinanceData";
import { useBankStatements } from "@/hooks/useBankData";
import { BANK_TO_ASSUMPTION_KEY, type BankSource } from "@/lib/bankParsers/types";

const TOLERANCE = 100;

// Shows an amber banner when any uploaded statement's closing balance differs
// from the corresponding Assumptions value by more than $100.
export const BalanceVerificationBanner = () => {
  const { data: assumptions = [] } = useAssumptions();
  const { data: statements = [] } = useBankStatements();

  const mismatches = useMemo(() => {
    if (!statements.length || !assumptions.length) return [];
    const assumByKey: Record<string, number> = {};
    for (const a of assumptions) assumByKey[a.key] = Number(a.value);

    // Latest statement per bank source.
    const latest: Record<string, typeof statements[number]> = {};
    for (const s of statements) {
      const cur = latest[s.bank_source];
      if (!cur || s.statement_date > cur.statement_date) latest[s.bank_source] = s;
    }

    const out: { source: BankSource; drift: number }[] = [];
    for (const [source, stmt] of Object.entries(latest)) {
      const key = BANK_TO_ASSUMPTION_KEY[source as BankSource];
      const assum = assumByKey[key];
      if (assum == null) continue;
      const drift = stmt.closing_balance - assum;
      if (Math.abs(drift) > TOLERANCE) out.push({ source: source as BankSource, drift });
    }
    return out;
  }, [statements, assumptions]);

  if (mismatches.length === 0) return null;

  return (
    <Alert
      className="border-[hsl(var(--warn-amber))]/40 bg-[hsl(var(--warn-amber))]/10 text-[hsl(var(--warn-amber))]"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        Opening balance mismatch on {mismatches.length} account{mismatches.length === 1 ? "" : "s"}
      </AlertTitle>
      <AlertDescription className="text-foreground/80">
        Statement uploads disagree with Assumptions for {mismatches.length} account
        {mismatches.length === 1 ? "" : "s"}.{" "}
        <Link
          to="/bank-imports#statements"
          className="font-medium text-[hsl(var(--warn-amber))] underline underline-offset-2"
        >
          Review in Bank Imports
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
};
