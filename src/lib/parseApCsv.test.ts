import { describe, it, expect } from "vitest";
import { parseApCsv, ApCsvParseError, AP_HORIZON_WEEKS } from "./parseApCsv";

const MON = "2026-06-22"; // anchor Monday used across the suite

describe("parseApCsv — header detection", () => {
  it("accepts the canonical Rillet headers (Name / Expense Due Date / Total Outstanding)", () => {
    const csv = `Name,Expense Due Date,Total Outstanding
Anthropic,2026-06-30,500000`;
    const r = parseApCsv(csv, { forecastStartIso: MON });
    expect(r.bills).toHaveLength(1);
    expect(r.bills[0].vendorKey).toBe("cogs_anthropic");
    expect(r.bills[0].amount).toBe(500000);
  });

  it("accepts alternative header names (Vendor / Bill Due Date / Open Balance)", () => {
    const csv = `Vendor,Bill Due Date,Open Balance
OpenAI,07/01/2026,250000`;
    const r = parseApCsv(csv, { forecastStartIso: MON });
    expect(r.bills).toHaveLength(1);
    expect(r.bills[0].vendorKey).toBe("cogs_openai");
  });

  it("throws on a file that lacks the required columns", () => {
    expect(() =>
      parseApCsv("Foo,Bar\n1,2", { forecastStartIso: MON })
    ).toThrow(ApCsvParseError);
  });
});

describe("parseApCsv — vendor mapping discipline", () => {
  it("maps the 8 AI/infra COGS vendors and EXCLUDES everything else", () => {
    const csv = `Name,Expense Due Date,Total Outstanding
Anthropic,2026-06-30,100
OpenAI Inc,2026-06-30,100
Deepgram,2026-06-30,100
Microsoft Azure,2026-06-30,100
AWS,2026-06-30,100
ElevenLabs,2026-06-30,100
Google Gemini,2026-06-30,100
Twilio Inc,2026-06-30,100
Oracle Cloud,2026-06-30,5000
Recruiting Vendor Co,2026-06-30,5000
Acme Legal LLP,2026-06-30,5000
Google Workspace,2026-06-30,5000`;
    const r = parseApCsv(csv, { forecastStartIso: MON });
    const keys = r.bills.map((b) => b.vendorKey).sort();
    expect(keys).toEqual(
      [
        "cogs_anthropic",
        "cogs_azure",
        "cogs_deepgram",
        "cogs_elevenlabs",
        "cogs_gemini",
        "cogs_openai",
        "cogs_pump_aws",
        "cogs_twilio",
      ].sort()
    );
    // Oracle/Recruiting/Legal/Google Workspace all excluded — none of them are COGS.
    expect(r.nonCogsSkipped).toBe(4);
    // cogs_other is NEVER produced from AP.
    expect(Object.keys(r.weeksByVendor)).not.toContain("cogs_other");
  });

  it("does not match bare 'Google' as Gemini (Google Workspace is OpEx)", () => {
    const csv = `Name,Expense Due Date,Total Outstanding
Google LLC,2026-06-30,12345`;
    const r = parseApCsv(csv, { forecastStartIso: MON });
    expect(r.bills).toHaveLength(0);
    expect(r.nonCogsSkipped).toBe(1);
  });
});

describe("parseApCsv — weekend-forward + bucketing", () => {
  it("rolls a Sunday due-date into the next Monday's week", () => {
    // 2026-07-05 is a Sunday → adjusts to Mon 2026-07-06 (W3 from a 2026-06-22 anchor).
    const csv = `Name,Expense Due Date,Total Outstanding
Anthropic,2026-07-05,1000`;
    const r = parseApCsv(csv, { forecastStartIso: MON });
    expect(r.bills[0].rawDueDate).toBe("2026-07-05");
    expect(r.bills[0].dueDate).toBe("2026-07-06");
    expect(r.bills[0].weekIndex).toBe(2); // W3 (0-indexed)
    expect(r.weeksByVendor.cogs_anthropic[2]).toBe(1000);
  });

  it("clamps past-due bills into W1", () => {
    const csv = `Name,Expense Due Date,Total Outstanding
OpenAI,2026-06-01,7777`;
    const r = parseApCsv(csv, { forecastStartIso: MON });
    expect(r.bills[0].weekIndex).toBe(0);
    expect(r.weeksByVendor.cogs_openai[0]).toBe(7777);
  });

  it("excludes bills due after the 5-week horizon from weeksByVendor and adds them to outOfHorizon", () => {
    // 2026-08-15 is well beyond W5 (which ends 2026-07-27).
    const csv = `Name,Expense Due Date,Total Outstanding
Anthropic,2026-08-15,9999`;
    const r = parseApCsv(csv, { forecastStartIso: MON });
    expect(r.bills).toHaveLength(0);
    expect(r.outOfHorizon).toBe(9999);
    expect(r.weeksByVendor.cogs_anthropic).toBeUndefined();
  });
});

describe("parseApCsv — W2 acceptance shape", () => {
  it("weeksTotal[1] sums Anthropic + OpenAI + Deepgram bills due in W2 (Jun 29 – Jul 5)", () => {
    // For MON = 2026-06-22: W2 spans 2026-06-29 .. 2026-07-05.
    const csv = `Name,Expense Due Date,Total Outstanding
Anthropic,2026-07-01,"$850,000"
OpenAI,2026-07-01,"$500,000"
Deepgram,2026-07-02,"$416,764"
Twilio,2026-07-24,30000
Acme Legal LLP,2026-07-01,9999`;
    const r = parseApCsv(csv, { forecastStartIso: MON });
    expect(r.weeksTotal).toHaveLength(AP_HORIZON_WEEKS);
    expect(r.weeksTotal[1]).toBe(850000 + 500000 + 416764);
    expect(r.nonCogsSkipped).toBe(1);
    // Twilio bill lands in W5 (2026-07-24 is a Friday).
    expect(r.weeksByVendor.cogs_twilio[4]).toBe(30000);
  });
});

describe("parseApCsv — guards", () => {
  it("throws on empty input", () => {
    expect(() => parseApCsv("", { forecastStartIso: MON })).toThrow(ApCsvParseError);
  });

  it("rejects a malformed forecastStartIso", () => {
    expect(() =>
      parseApCsv("Name,Expense Due Date,Total Outstanding\nA,2026-06-30,1", {
        forecastStartIso: "06/22/2026",
      })
    ).toThrow(ApCsvParseError);
  });
});
