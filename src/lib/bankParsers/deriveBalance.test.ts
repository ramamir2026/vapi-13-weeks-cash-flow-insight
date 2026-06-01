import { describe, it, expect } from "vitest";
import { deriveOpeningBalance, priorFridayISO } from "./deriveBalance";
import type { ParsedTxn } from "./types";

const r = (date: string, balance: number | null, amount = 1): ParsedTxn => ({
  id: Math.random().toString(36).slice(2),
  date,
  vendor: "x",
  amount,
  balance,
  category: "unmatched",
  bank_source: "svb_checking",
});

describe("priorFridayISO", () => {
  it("returns today when today is Friday", () => {
    expect(priorFridayISO(new Date("2026-05-29T12:00:00Z"))).toBe("2026-05-29");
  });
  it("returns the most recent Friday from a Monday", () => {
    // Mon Jun 1 2026 → prior Friday = May 29 2026
    expect(priorFridayISO(new Date("2026-06-01T12:00:00Z"))).toBe("2026-05-29");
  });
  it("returns the most recent Friday from a Sunday", () => {
    // Sun May 31 2026 → May 29
    expect(priorFridayISO(new Date("2026-05-31T12:00:00Z"))).toBe("2026-05-29");
  });
  it("returns yesterday Friday from a Saturday", () => {
    expect(priorFridayISO(new Date("2026-05-30T12:00:00Z"))).toBe("2026-05-29");
  });
});

describe("deriveOpeningBalance", () => {
  const cutoff = "2026-05-29"; // Friday

  it("returns null when no rows have a balance in range", () => {
    expect(deriveOpeningBalance([], cutoff)).toBeNull();
    expect(
      deriveOpeningBalance([r("2026-05-12", null), r("2026-05-30", 100)], cutoff)
    ).toBeNull();
  });

  it("picks the row with the latest date ≤ cutoff, not the last row", () => {
    const rows = [
      r("2026-05-12", 1_000_000),
      r("2026-05-27", 1_100_000), // ← should win (latest in-range)
      r("2026-05-30", 1_200_000), // after cutoff, ignored
      r("2026-06-02", 1_300_000), // after cutoff, ignored
    ];
    const out = deriveOpeningBalance(rows, cutoff);
    expect(out).toEqual({ balance: 1_100_000, asOf: "2026-05-27" });
  });

  it("uses the LAST row on the latest in-range date when multiple same-day rows exist", () => {
    const rows = [
      r("2026-05-12", 900_000),
      r("2026-05-29", 1_000_000, 50_000),
      r("2026-05-29", 1_050_000, 50_000),
      r("2026-05-29", 1_025_000, -25_000), // last same-day row → use this
    ];
    const out = deriveOpeningBalance(rows, cutoff);
    expect(out).toEqual({ balance: 1_025_000, asOf: "2026-05-29" });
  });

  it("ignores rows whose balance is null", () => {
    const rows = [
      r("2026-05-27", 500),
      r("2026-05-28", null), // skipped
      r("2026-05-29", null), // skipped
    ];
    const out = deriveOpeningBalance(rows, cutoff);
    expect(out).toEqual({ balance: 500, asOf: "2026-05-27" });
  });

  it("defaults to prior Friday when no cutoff is passed", () => {
    const friday = priorFridayISO();
    const rows = [r(friday, 42)];
    expect(deriveOpeningBalance(rows)).toEqual({ balance: 42, asOf: friday });
  });
});
