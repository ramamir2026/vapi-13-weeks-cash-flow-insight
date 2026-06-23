import { describe, it, expect } from "vitest";
import { reconcileParsedRows } from "./reconcile";
import type { ParsedTxn, BankSource } from "./types";

const mk = (
  date: string,
  amount: number,
  balance: number | null,
  source: BankSource = "brex_primary",
): ParsedTxn => ({
  id: `${date}-${Math.random()}`,
  date,
  vendor: "test",
  amount,
  balance,
  category: "unmatched",
  bank_source: source,
});

// Build a sequential ledger from an opening balance and a list of deltas.
const buildLedger = (
  startDate: string,
  opening: number,
  deltas: number[],
): ParsedTxn[] => {
  let bal = opening;
  const rows: ParsedTxn[] = [];
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  for (let i = 0; i < deltas.length; i++) {
    bal += deltas[i];
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    rows.push(mk(d, deltas[i], bal));
  }
  return rows;
};

describe("reconcileParsedRows", () => {
  it("clean ledger reconciles ok", () => {
    const rows = buildLedger("2026-04-01", 1_000_000, [100, -200, 50, -25, 500]);
    const r = reconcileParsedRows(rows, "brex_primary");
    expect(r.status).toBe("ok");
    expect(Math.abs(r.diff ?? 999)).toBeLessThanOrEqual(r.tolerance);
  });

  it("flipping one amount sign produces a mismatch", () => {
    const rows = buildLedger("2026-04-01", 1_000_000, [100, -200, 50, -25, 500]);
    // Corrupt an amount well beyond tolerance (0.1% of last balance ≈ $1k).
    rows[2] = { ...rows[2], amount: rows[2].amount + 50_000 };
    const r = reconcileParsedRows(rows, "brex_primary");
    expect(r.status).toBe("mismatch");
    expect(Math.abs(r.diff ?? 0)).toBeGreaterThan(r.tolerance);
  });

  it("no balance column → no_balance info status (Ramp)", () => {
    const rows = [
      mk("2026-04-01", -500, null, "ramp_checking"),
      mk("2026-04-02", 1_000, null, "ramp_checking"),
    ];
    const r = reconcileParsedRows(rows, "ramp_checking");
    expect(r.status).toBe("no_balance");
  });

  it("SVB MM without anchor (no balances) → no_balance", () => {
    const rows = [
      mk("2026-04-01", -1_000, null, "svb_money_market"),
      mk("2026-04-02", 2_000, null, "svb_money_market"),
    ];
    const r = reconcileParsedRows(rows, "svb_money_market");
    expect(r.status).toBe("no_balance");
  });

  it("partial coverage with clean tie → partial", () => {
    const rows = buildLedger("2026-04-01", 100_000, [10, -20, 30]);
    // Strip balance from one mid-row → partial coverage but still ties.
    rows[1] = { ...rows[1], balance: null };
    const r = reconcileParsedRows(rows, "brex_primary");
    expect(r.status).toBe("partial");
  });

  it("multi-year file with messy old rows but clean recent window → ok", () => {
    // 2020–2024: deliberately inconsistent (balances don't tie to amounts).
    const oldRows: ParsedTxn[] = [];
    for (let y = 2020; y <= 2024; y++) {
      oldRows.push(mk(`${y}-01-15`, 1_000, 500_000 + y * 1_000));
      oldRows.push(mk(`${y}-06-15`, -2_000, 480_000 + y * 1_000));
    }
    // Recent 90-day window: clean ledger.
    const recent = buildLedger("2026-05-01", 1_500_000, [
      250, -1_000, 500, -750, 1_200, -300, 75, -100, 400, -50,
    ]);
    const r = reconcileParsedRows([...oldRows, ...recent], "brex_primary");
    expect(r.status).toBe("ok");
    expect(r.windowRowCount).toBeLessThan(oldRows.length + recent.length);
    // Window must start in 2026 (within ~90 days of latest row).
    expect(r.windowStartDate?.startsWith("2026")).toBe(true);
  });

  it("multi-year file with broken recent window → mismatch", () => {
    const oldRows = buildLedger("2020-01-01", 500_000, [10, -20, 30, -40]);
    const recent = buildLedger("2026-05-01", 1_500_000, [250, -1_000, 500]);
    // Corrupt one recent amount.
    recent[1] = { ...recent[1], amount: recent[1].amount + 100_000 };
    const r = reconcileParsedRows([...oldRows, ...recent], "brex_primary");
    expect(r.status).toBe("mismatch");
  });
});
