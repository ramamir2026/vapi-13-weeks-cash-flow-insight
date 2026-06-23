import { describe, it, expect } from "vitest";
import { parseHiresCsv } from "./parseHiresCsv";

describe("parseHiresCsv — header-name mapping", () => {
  it("resolves columns by header name regardless of order and prefers Est Start Date", () => {
    const csv = `Notes,Hiring Stage,Est Start Date,Start Date,Base Salary,Role,New Hire
ramp hire,Accepted,2026-07-13,2026-09-01,"$185,000",Senior Engineer,Jane Doe`;
    const rows = parseHiresCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Jane Doe",
      role: "Senior Engineer",
      annualSalary: 185000,
      startDate: "2026-07-13", // preferred over the plain Start Date column
      status: "confirmed",
      notes: "ramp hire",
    });
  });

  it("maps hiring stage to status: accepted→confirmed, offer→offer_sent, else interviewing", () => {
    const csv = `Role,Start Date,Salary,Stage,Candidate
Eng,2026-07-01,150000,Accepted,A
Eng,2026-07-01,150000,Offer Extended,B
Eng,2026-07-01,150000,Phone Screen,C
Eng,2026-07-01,150000,Signed,D`;
    const rows = parseHiresCsv(csv);
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["A", "confirmed"],
      ["B", "offer_sent"],
      ["C", "interviewing"],
      ["D", "confirmed"],
    ]);
  });

  it("skips rows with TBD/N/A start dates, missing dates, or non-positive salary", () => {
    const csv = `Role,Start Date,Salary,Stage,Candidate
Eng,TBD,150000,Accepted,Skip TBD
Eng,N/A,150000,Accepted,Skip NA
Eng,,150000,Accepted,Skip Empty
Eng,2026-07-01,$0,Accepted,Skip Zero
Eng,2026-07-01,"$150,000",Accepted,Keep`;
    const rows = parseHiresCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Keep", annualSalary: 150000 });
  });

  it("parses both YYYY-MM-DD and M/D/YYYY date formats", () => {
    const csv = `Role,Start Date,Salary,Stage,Candidate
Eng,2026-07-01,150000,Accepted,Iso
Eng,8/15/2026,150000,Accepted,Us
Eng,1/2/26,150000,Accepted,UsShort`;
    const rows = parseHiresCsv(csv);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.startDate]));
    expect(byName["Iso"]).toBe("2026-07-01");
    expect(byName["Us"]).toBe("2026-08-15");
    expect(byName["UsShort"]).toBe("2026-01-02");
  });

  it("falls back to role as the label when no name/candidate column is present", () => {
    const csv = `Role,Start Date,Salary,Stage
Senior Engineer,2026-07-01,180000,Accepted`;
    const rows = parseHiresCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Senior Engineer");
    expect(rows[0].role).toBe("Senior Engineer");
  });

  it("finds the header row even with blank/junk lines above it", () => {
    const csv = `Hiring Roadmap — Q3 2026
,,,,
,Generated 2026-06-22,,,
Role,Start Date,Salary,Stage,Candidate
Eng,2026-07-01,150000,Accepted,Jane`;
    const rows = parseHiresCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Jane");
  });
});
