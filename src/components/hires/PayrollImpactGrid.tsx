import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { PAYROLL_PERIODS, periodCellAmount } from "@/lib/payrollPeriods";
import type { FutureHire } from "@/hooks/useFinanceData";

type Props = {
  hires: FutureHire[];
};

export const PayrollImpactGrid = ({ hires }: Props) => {
  const fmt = (v: number) => (v > 0 ? formatCurrency(v) : "—");

  // Per-hire row data
  const rows = hires.map((h) => {
    const cells = PAYROLL_PERIODS.map((p) =>
      periodCellAmount(h.start_date, Number(h.annual_salary), p)
    );
    const sum = cells.reduce((s, v) => s + v, 0);
    return { hire: h, cells, sum };
  });

  // Column totals
  const totals = PAYROLL_PERIODS.map((_, i) =>
    rows.reduce((s, r) => s + r.cells[i], 0)
  );
  const grandTotal = totals.reduce((s, v) => s + v, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payroll Impact (Semi-Monthly Periods)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Hire</TableHead>
                {PAYROLL_PERIODS.map((p) => (
                  <TableHead key={p.key} className="min-w-[110px] text-right">
                    {p.key}
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {p.label} · W{p.weekIndex + 1}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="min-w-[110px] text-right font-semibold">Sum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={PAYROLL_PERIODS.length + 2}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Add hires above to see their payroll impact across the 6 pay periods.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.hire.id}>
                    <TableCell className="font-medium">
                      {r.hire.name}
                      <div className="text-xs font-normal text-muted-foreground">
                        {r.hire.role}
                      </div>
                    </TableCell>
                    {r.cells.map((v, i) => (
                      <TableCell key={i} className="text-right tabular-nums">
                        {fmt(v)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmt(r.sum)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-semibold">
                <td className="p-3">TOTAL</td>
                {totals.map((v, i) => (
                  <td key={i} className="p-3 text-right tabular-nums">
                    {fmt(v)}
                  </td>
                ))}
                <td className="p-3 text-right tabular-nums">{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
