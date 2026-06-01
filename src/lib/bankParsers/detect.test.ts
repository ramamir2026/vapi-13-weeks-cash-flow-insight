import { describe, it, expect } from "vitest";
import { detectAndParse } from "./detect";

// Real-world header samples — one per supported file type.
// Each fixture includes the bank's header row + a single representative data row,
// because detection now reads the first data row to resolve the account.

const brexHeader =
  "Date,To/From,Amount,Balance,Status,Account Number Last Four";

const brexPrimary = `${brexHeader}
2026-05-12,Stripe Payout,12345.67,1000000.00,Posted,8083`;

const brexTreasury = `${brexHeader}
2026-05-12,Sweep In,50000.00,8000000.00,Posted,2515`;

const brexStripeClearing = `${brexHeader}
2026-05-12,Stripe Transfer,9000.00,75000.00,Posted,9173`;

const svbBaiHeader =
  "Bank ID,Account Number,Account Title,BAI Type Code,Posting Date,Credit Amount,Debit Amount,Closing Ledger Balance,Text";

const svbChecking = `${svbBaiHeader}
121140399,1234567894687,VAPI Operating,475,2026-05-12,1500.00,0.00,1000000.00,Wire In`;

const svbCollateral = `${svbBaiHeader}
121140399,9876543210999,VAPI Collateral MMA,475,2026-05-12,0.01,0.00,5000000.01,Interest`;

const svbSweep = `Sweep Account,Sweep Product,Date,Description,Credit,Debit,Balance
1234,Heritage MMA,2026-05-12,Sweep In,10000.00,0.00,5000000.00`;

const ramp = `Date,Merchant,Signed Transaction Amount,Detailed Transaction Type,Balance
2026-05-12,Anthropic,-1234.56,card_purchase,98765.43`;

const stripe = `Date,Description,Amount,Balance
2026-05-12,charge,123.45,1000.00`;

const svbMoneyMarketLegacy = `Date,Description,Credit,Debit,Balance
2026-05-12,Sweep In,10000.00,0.00,5000000.00`;

describe("detectAndParse — content-based detection", () => {
  it("Brex primary: last-four 8083 → brex_primary (high confidence)", () => {
    const r = detectAndParse(brexPrimary, "anything.csv");
    expect(r.source).toBe("brex_primary");
    expect(r.confidence).toBe("high");
    expect(r.warnings.join(" ")).toMatch(/8083/);
  });

  it("Brex treasury: last-four 2515 → brex_treasury (high)", () => {
    const r = detectAndParse(brexTreasury, "random-name.csv");
    expect(r.source).toBe("brex_treasury");
    expect(r.confidence).toBe("high");
  });

  it("Brex stripe clearing: last-four 9173 → brex_stripe_clearing (high)", () => {
    const r = detectAndParse(brexStripeClearing, "x.csv");
    expect(r.source).toBe("brex_stripe_clearing");
    expect(r.confidence).toBe("high");
  });

  it("SVB BAI: account ending 4687 → svb_checking (high)", () => {
    const r = detectAndParse(svbChecking, "export.csv");
    expect(r.source).toBe("svb_checking");
    expect(r.confidence).toBe("high");
    expect(r.warnings.join(" ")).toMatch(/4687/);
  });

  it("SVB BAI: account ending 0999 → svb_collateral (high)", () => {
    const r = detectAndParse(svbCollateral, "export.csv");
    expect(r.source).toBe("svb_collateral");
    expect(r.confidence).toBe("high");
    expect(r.warnings.join(" ")).toMatch(/0999/);
  });

  it("SVB sweep header → svb_money_market (high)", () => {
    const r = detectAndParse(svbSweep, "weird.csv");
    expect(r.source).toBe("svb_money_market");
    expect(r.confidence).toBe("high");
  });

  it("Ramp header → ramp_checking (high)", () => {
    const r = detectAndParse(ramp, "transactions.csv");
    expect(r.source).toBe("ramp_checking");
    expect(r.confidence).toBe("high");
  });

  it("Ramp header + treasury filename → ramp_treasury", () => {
    const r = detectAndParse(ramp, "ramp_treasury_may.csv");
    expect(r.source).toBe("ramp_treasury");
  });

  it("Generic Date/Description/Amount/Balance + stripe filename → stripe", () => {
    const r = detectAndParse(stripe, "stripe_payouts.csv");
    expect(r.source).toBe("stripe");
  });

  it("Generic Credit/Debit (no bank signature) → svb_money_market (lower confidence)", () => {
    const r = detectAndParse(svbMoneyMarketLegacy, "");
    expect(r.source).toBe("svb_money_market");
    expect(["medium", "low"]).toContain(r.confidence);
  });

  it("Filename used only as last-resort tiebreaker", () => {
    // Brex header with unknown last-four; filename says brex_treasury.
    const unknown = `${brexHeader}\n2026-05-12,X,1.00,1.00,Posted,0000`;
    const r = detectAndParse(unknown, "brex_treasury_may.csv");
    expect(r.source).toBe("brex_treasury");
    expect(r.confidence).toBe("medium");
  });

  it("Surfaces a warning telling the user which signal was used", () => {
    const r = detectAndParse(brexPrimary, "ignored.csv");
    expect(r.warnings.some((w) => /via:/i.test(w))).toBe(true);
  });
});
