import { describe, it, expect } from "vitest";
import { parseArCsv, probabilityForAging } from "./parseArCsv";

describe("parseArCsv — Rillet headers", () => {
  it("maps '1-30 days' and '90+ days' to b1_30 and b91_plus", () => {
    const csv = `Customer,Aging Current,1-30 days,31-60 days,61-90 days,90+ days,Total
Acme Inc,0,5000,0,0,1200,6200`;
    const rows = parseArCsv(csv);
    expect(rows).toHaveLength(2);
    const byBucket = Object.fromEntries(rows.map((r) => [r.bucketLabel, r]));
    expect(byBucket["1-30"]).toBeDefined();
    expect(byBucket["1-30"].amount).toBe(5000);
    expect(byBucket["1-30"].customer).toBe("Acme Inc");
    expect(byBucket["91+"]).toBeDefined();
    expect(byBucket["91+"].amount).toBe(1200);
  });
});

describe("parseArCsv — probability + expected week per bucket", () => {
  it("assigns the documented probability and expectedWeek to each bucket", () => {
    const csv = `Customer,Current,1-30,31-60,61-90,91 and over,Total
Globex,100,200,300,400,500,1500`;
    const rows = parseArCsv(csv);
    const byBucket = Object.fromEntries(rows.map((r) => [r.bucketLabel, r]));

    expect(byBucket["Current"]).toMatchObject({ probability: 1.0, expectedWeek: 1, amount: 100 });
    expect(byBucket["1-30"]).toMatchObject({ probability: 0.9, expectedWeek: 2, amount: 200 });
    expect(byBucket["31-60"]).toMatchObject({ probability: 0.75, expectedWeek: 4, amount: 300 });
    expect(byBucket["61-90"]).toMatchObject({ probability: 0.6, expectedWeek: 7, amount: 400 });
    expect(byBucket["91+"]).toMatchObject({ probability: 0.3, expectedWeek: 10, amount: 500 });
  });
});

describe("probabilityForAging boundaries", () => {
  it("returns the documented weight at each bucket edge", () => {
    expect(probabilityForAging(0)).toBe(1.0);
    expect(probabilityForAging(30)).toBe(0.9);
    expect(probabilityForAging(60)).toBe(0.75);
    expect(probabilityForAging(90)).toBe(0.6);
    expect(probabilityForAging(91)).toBe(0.3);
    expect(probabilityForAging(365)).toBe(0.3);
  });
});
