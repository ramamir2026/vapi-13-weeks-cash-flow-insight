// Format-agnostic file ingestion. Converts CSV / TSV / TXT / Excel / PDF into
// normalized CSV text so the downstream detectors and parsers can stay
// unchanged. Excel workbooks expose one Sheet entry per worksheet; PDFs and
// plain text expose a single sheet.
import * as XLSX from "xlsx";

export type Sheet = { name: string; csv: string };

export type Ingested = {
  kind: "csv" | "xlsx" | "pdf";
  filename: string;
  text: string;
  sheets: Sheet[];
};

export interface FileLike {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  text?(): Promise<string>;
}

const EXCEL_EXTS = [".xlsx", ".xlsm", ".xlsb", ".xls"];

const stripBom = (s: string): string => s.replace(/^\uFEFF/, "");
const normalizeNewlines = (s: string): string => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const normalize = (s: string): string => normalizeNewlines(stripBom(s));

const extOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
};

const decodeText = async (file: FileLike): Promise<string> => {
  if (typeof file.text === "function") return file.text();
  const buf = await file.arrayBuffer();
  return new TextDecoder("utf-8").decode(buf);
};

// ---- PDF text extraction (shared with bankParsers/statement.ts) -------------

type PdfRow = { y: number; cells: { x: number; str: string }[] };

// Extract text from a PDF, grouping items into visual rows by rounded y, then
// sorting each row left-to-right by x. Cells within a row are joined by `sep`
// and rows by newlines. Use sep="," for CSV-shaped output (ingest), sep=" "
// for free text (statement parsing).
export const extractTextFromPdfBuffer = async (
  buf: ArrayBuffer,
  sep = " ",
): Promise<string> => {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    type Item = { str: string; x: number; y: number };
    const items: Item[] = (tc.items as unknown[])
      .map((it: any) => {
        if (!it || typeof it !== "object" || !("str" in it)) return null;
        const tr = (it as any).transform || [1, 0, 0, 1, 0, 0];
        return { str: String((it as any).str), x: Number(tr[4]), y: Number(tr[5]) };
      })
      .filter((v): v is Item => !!v && v.str.length > 0);

    const rows = new Map<number, Item[]>();
    for (const it of items) {
      const key = Math.round(it.y / 3) * 3;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push(it);
    }
    const sortedYs = [...rows.keys()].sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of sortedYs) {
      const row = rows.get(y)!.sort((a, b) => a.x - b.x);
      lines.push(row.map((r) => r.str).join(sep));
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n");
};

// ---- ingestFile -------------------------------------------------------------

export const ingestFile = async (file: FileLike): Promise<Ingested> => {
  const filename = file.name;
  const ext = extOf(filename);

  // Excel
  if (EXCEL_EXTS.includes(ext)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
    const sheets: Sheet[] = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const csv = normalize(
        XLSX.utils.sheet_to_csv(ws, { FS: ",", blankrows: false, dateNF: "yyyy-mm-dd" }),
      );
      if (csv.trim().length === 0) continue;
      sheets.push({ name, csv });
    }
    return {
      kind: "xlsx",
      filename,
      text: sheets[0]?.csv ?? "",
      sheets,
    };
  }

  // PDF
  if (ext === ".pdf") {
    const buf = await file.arrayBuffer();
    const text = normalize(await extractTextFromPdfBuffer(buf, ","));
    return {
      kind: "pdf",
      filename,
      text,
      sheets: [{ name: "pdf", csv: text }],
    };
  }

  // Delimited text (csv / tsv / txt / unknown)
  const raw = normalize(await decodeText(file));
  const firstLine = raw.split("\n", 1)[0] ?? "";
  const text =
    firstLine.includes("\t") && !firstLine.includes(",")
      ? raw.replace(/\t/g, ",")
      : raw;
  return {
    kind: "csv",
    filename,
    text,
    sheets: [{ name: "csv", csv: text }],
  };
};

// ---- sheet pickers ----------------------------------------------------------

export const pickSheet = (
  ing: Ingested,
  matches: (csv: string, name: string) => boolean,
): Sheet | null => {
  for (const s of ing.sheets) if (matches(s.csv, s.name)) return s;
  return ing.sheets[0] ?? null;
};

export const pickSheetByName = (ing: Ingested, re: RegExp): Sheet | null => {
  for (const s of ing.sheets) if (re.test(s.name)) return s;
  return null;
};
