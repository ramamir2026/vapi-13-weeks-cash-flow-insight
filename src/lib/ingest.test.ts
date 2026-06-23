import { describe, it, expect } from "vitest";
import { ingestFile, pickSheet, pickSheetByName, type FileLike, type Ingested } from "./ingest";

// Minimal FileLike that exposes text(); arrayBuffer() is the fallback path.
const makeTextFile = (name: string, text: string): FileLike => ({
  name,
  async arrayBuffer() {
    return new TextEncoder().encode(text).buffer;
  },
  async text() {
    return text;
  },
});

// FileLike WITHOUT a text() method — forces ingestFile to decode the buffer.
const makeBufferOnlyFile = (name: string, text: string): FileLike => ({
  name,
  async arrayBuffer() {
    return new TextEncoder().encode(text).buffer;
  },
});

describe("ingestFile — CSV/TSV/TXT passthrough", () => {
  it("returns CSV text untouched (kind=csv, one sheet)", async () => {
    const csv = "Date,Amount\n2026-05-12,100\n2026-05-13,200\n";
    const ing = await ingestFile(makeTextFile("foo.csv", csv));
    expect(ing.kind).toBe("csv");
    expect(ing.filename).toBe("foo.csv");
    expect(ing.text).toBe(csv);
    expect(ing.sheets).toHaveLength(1);
    expect(ing.sheets[0]).toEqual({ name: "csv", csv });
  });

  it("converts TSV to comma-separated text when the first line has tabs and no commas", async () => {
    const tsv = "Date\tAmount\n2026-05-12\t100\n2026-05-13\t200\n";
    const ing = await ingestFile(makeTextFile("foo.tsv", tsv));
    expect(ing.kind).toBe("csv");
    expect(ing.text).toBe("Date,Amount\n2026-05-12,100\n2026-05-13,200\n");
  });

  it("leaves tab characters alone when the first line already contains commas", async () => {
    // Mixed: tabs inside quoted-looking cells but commas already structure the row.
    const mixed = "Date,Description,Amount\n2026-05-12,foo\tbar,100\n";
    const ing = await ingestFile(makeTextFile("foo.csv", mixed));
    expect(ing.text).toBe(mixed);
  });

  it("strips BOM and normalizes CRLF/CR newlines", async () => {
    const raw = "\uFEFFDate,Amount\r\n2026-05-12,100\r2026-05-13,200\r\n";
    const ing = await ingestFile(makeTextFile("foo.csv", raw));
    expect(ing.text.startsWith("\uFEFF")).toBe(false);
    expect(ing.text).toBe("Date,Amount\n2026-05-12,100\n2026-05-13,200\n");
  });

  it("falls back to arrayBuffer() + UTF-8 decode when FileLike has no text()", async () => {
    const csv = "Date,Amount\n2026-05-12,100\n";
    const ing = await ingestFile(makeBufferOnlyFile("foo.csv", csv));
    expect(ing.kind).toBe("csv");
    expect(ing.text).toBe(csv);
  });

  it("treats unknown extensions as delimited text", async () => {
    const txt = "Date,Amount\n2026-05-12,100\n";
    const ing = await ingestFile(makeTextFile("foo.weird", txt));
    expect(ing.kind).toBe("csv");
    expect(ing.text).toBe(txt);
  });
});

describe("pickSheet / pickSheetByName", () => {
  const ing: Ingested = {
    kind: "xlsx",
    filename: "workbook.xlsx",
    text: "",
    sheets: [
      { name: "Summary", csv: "header\nsummary content" },
      { name: "Hiring Roadmap Q3 2026", csv: "Role,Start Date,Salary\nEng,2026-07-01,150000" },
      { name: "Notes", csv: "free form notes" },
    ],
  };

  it("pickSheet returns the first sheet matching the predicate", () => {
    const sheet = pickSheet(ing, (csv) => csv.includes("Role,Start Date"));
    expect(sheet?.name).toBe("Hiring Roadmap Q3 2026");
  });

  it("pickSheet falls back to the first sheet when nothing matches", () => {
    const sheet = pickSheet(ing, () => false);
    expect(sheet?.name).toBe("Summary");
  });

  it("pickSheet returns null when there are no sheets at all", () => {
    const empty: Ingested = { kind: "csv", filename: "x.csv", text: "", sheets: [] };
    expect(pickSheet(empty, () => true)).toBeNull();
  });

  it("pickSheetByName matches by regex against the sheet name", () => {
    const sheet = pickSheetByName(ing, /hiring/i);
    expect(sheet?.name).toBe("Hiring Roadmap Q3 2026");
  });

  it("pickSheetByName returns null when no sheet name matches", () => {
    expect(pickSheetByName(ing, /nonexistent/i)).toBeNull();
  });
});
