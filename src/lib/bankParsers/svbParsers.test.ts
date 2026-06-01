import { describe, it, expect } from "vitest";
import { parseSvbCheckingCsv } from "./svbChecking";
import { parseSvbMoneyMarketCsv } from "./svbMoneyMarket";

// ---------- SVB BAI (Checking + Collateral) ----------
const svbBaiSample = `Bank ID,Account Number,Account Title,BAI Type Code,Posting Date,Credit Amount,Debit Amount,Closing Ledger Balance,Text,Customer Reference,Bank Reference
121140399,1234567894687,VAPI Operating,475,2026-05-12,150000.00,0.00,2150000.00,WIRE IN ACME CORP,INV-1001,REF-A
121140399,1234567894687,VAPI Operating,495,2026-05-13,0.00,2500.00,2147500.00,ACH DEBIT ANTHROPIC,,REF-B
121140399,1234567894687,VAPI Operating,475,2026-05-14,75000.00,0.00,2222500.00,WIRE IN STRIPE PAYOUT,INV-1002,REF-C
`;

const svbCollateralSample = `Bank ID,Account Number,Account Title,BAI Type Code,Posting Date,Credit Amount,Debit Amount,Closing Ledger Balance,Text
121140399,9876543210999,VAPI Collateral MMA,475,2026-05-12,1.23,0.00,5000001.23,INTEREST CREDIT
`;

describe("parseSvbCheckingCsv (BAI)", () => {
  it("parses Credit/Debit Amount + Closing Ledger Balance for svb_checking", () => {
    const rows = parseSvbCheckingCsv(svbBaiSample, "svb_checking");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      date: "2026-05-12",
      amount: 150000,
      balance: 2150000,
      bank_source: "svb_checking",
    });
    expect(rows[1].amount).toBe(-2500); // debit → negative
    expect(rows[1].balance).toBe(2147500);
    expect(rows[2].amount).toBe(75000);
  });

  it("derives vendor from Text / Customer Reference / Bank Reference", () => {
    const rows = parseSvbCheckingCsv(svbBaiSample, "svb_checking");
    expect(rows[0].vendor).toMatch(/ACME/i);
    expect(rows[1].vendor).toMatch(/ANTHROPIC/i);
  });

  it("reuses the same parser for svb_collateral with the right bank_source", () => {
    const rows = parseSvbCheckingCsv(svbCollateralSample, "svb_collateral");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bank_source: "svb_collateral",
      amount: 1.23,
      balance: 5000001.23,
    });
  });

  it("returns [] when no recognizable BAI header is present", () => {
    expect(parseSvbCheckingCsv("foo,bar\n1,2")).toEqual([]);
  });
});

// ---------- SVB Money Market sweep ----------
const sweepSample = `Date,Transaction,Sweep Account,Sweep Product,Amount
2026-05-12,Sweep In,1234,Heritage MMA,1000000.00
2026-05-13,Sweep Out,1234,Heritage MMA,-250000.00
2026-05-14,Sweep In,1234,Heritage MMA,50000.00
`;

describe("parseSvbMoneyMarketCsv (sweep report)", () => {
  it("parses Date/Transaction/Sweep Account/Sweep Product/Amount", () => {
    const rows = parseSvbMoneyMarketCsv(sweepSample);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.amount)).toEqual([1000000, -250000, 50000]);
    expect(rows.every((r) => r.bank_source === "svb_money_market")).toBe(true);
  });

  it("derives a running balance as the cumulative sum of Amount", () => {
    const rows = parseSvbMoneyMarketCsv(sweepSample);
    expect(rows[0].balance).toBe(1000000);
    expect(rows[1].balance).toBe(750000);
    expect(rows[2].balance).toBe(800000);
    // Last row's balance is the account's ending position.
    expect(rows[rows.length - 1].balance).toBe(800000);
  });

  it("uses Transaction as vendor when present", () => {
    const rows = parseSvbMoneyMarketCsv(sweepSample);
    expect(rows[0].vendor).toMatch(/sweep in/i);
    expect(rows[1].vendor).toMatch(/sweep out/i);
  });

  it("still supports the legacy Credit/Debit/Balance shape", () => {
    const legacy = `Date,Description,Credit,Debit,Balance
2026-05-12,Sweep In,10000.00,0.00,5000000.00
2026-05-13,Sweep Out,0.00,2500.00,4997500.00`;
    const rows = parseSvbMoneyMarketCsv(legacy);
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(10000);
    expect(rows[1].amount).toBe(-2500);
    expect(rows[1].balance).toBe(4997500);
  });
});
