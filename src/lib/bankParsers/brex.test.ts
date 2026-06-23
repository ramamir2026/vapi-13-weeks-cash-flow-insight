import { describe, it, expect } from "vitest";
import { parseBrexCsv } from "./brex";

describe("parseBrexCsv", () => {
  it("empty Memo does not clobber the To/From vendor", () => {
    const csv = `Date,To/From,Memo,Amount,Balance,Status,Account Number Last Four
2026-05-12,Stripe Payout,,12345.67,1000000.00,Posted,8083`;
    const rows = parseBrexCsv(csv, "brex_primary");
    expect(rows).toHaveLength(1);
    expect(rows[0].vendor).toBe("Stripe Payout");
    expect(rows[0].amount).toBe(12345.67);
    expect(rows[0].balance).toBe(1000000);
  });


  it("excludes NSF / Processing / Reversed rows; keeps Posted rows", () => {
    const csv = `Date,To/From,Amount,Balance,Status,Account Number Last Four
2026-05-12,Stripe Payout,1000.00,1001000.00,Posted,8083
2026-05-12,Bounced ACH,-500.00,1000500.00,Insufficient Funds,8083
2026-05-13,Pending Vendor,-200.00,1000300.00,Processing,8083
2026-05-13,Reversed Charge,-300.00,1000000.00,Reversed,8083
2026-05-14,Acme Wire,2500.00,1002500.00,Posted,8083`;
    const rows = parseBrexCsv(csv, "brex_primary");
    expect(rows).toHaveLength(2);
    const vendors = rows.map((r) => r.vendor);
    expect(vendors).toContain("Stripe Payout");
    expect(vendors).toContain("Acme Wire");
    expect(vendors).not.toContain("Bounced ACH");
    expect(vendors).not.toContain("Pending Vendor");
    expect(vendors).not.toContain("Reversed Charge");
  });
});
