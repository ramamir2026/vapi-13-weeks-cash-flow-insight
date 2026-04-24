// Statement parser: extracts the closing balance from a CSV or text-based PDF
// monthly statement. Used for opening-balance verification.
import { parseAmount } from "./types";

// Try to find a "balance" or "ending balance" number in the last few non-empty
// rows of a CSV. Falls back to the largest absolute number near the bottom.
export const extractClosingBalanceFromCsv = (text: string): number | null => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Look for an explicit "ending balance" / "closing balance" label first.
  const labelRe = /(ending|closing|final)\s+balance[^0-9\-(]*([\-(]?\$?[\d,]+\.?\d*\)?)/i;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
    const m = lines[i].match(labelRe);
    if (m) {
      const v = parseAmount(m[2]);
      if (v) return v;
    }
  }

  // Fallback: take the last numeric column from the last data row.
  for (let i = lines.length - 1; i >= 0; i--) {
    const cells = lines[i].split(",");
    for (let j = cells.length - 1; j >= 0; j--) {
      const v = parseAmount(cells[j]);
      if (v && Math.abs(v) > 100) return v;
    }
  }
  return null;
};

// Extract text from a PDF using pdfjs-dist. Returns concatenated page text.
// Items are sorted top-to-bottom, left-to-right per page so multi-column PDFs
// produce a sane reading order before we run regex against the text.
export const extractTextFromPdf = async (file: File): Promise<string> => {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();

    // Group items into rows by Y coordinate, then sort each row by X.
    type Item = { str: string; x: number; y: number };
    const items: Item[] = tc.items
      .map((it: any) => {
        if (!("str" in it)) return null;
        const tr = it.transform || [1, 0, 0, 1, 0, 0];
        return { str: it.str as string, x: tr[4] as number, y: tr[5] as number };
      })
      .filter((v): v is Item => !!v && v.str.length > 0);

    // Bucket by ~3pt Y bands.
    const rows = new Map<number, Item[]>();
    for (const it of items) {
      const key = Math.round(it.y / 3) * 3;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push(it);
    }
    const sortedYs = [...rows.keys()].sort((a, b) => b - a); // top → bottom
    const lines: string[] = [];
    for (const y of sortedYs) {
      const row = rows.get(y)!.sort((a, b) => a.x - b.x);
      lines.push(row.map((r) => r.str).join(" "));
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n");
};

// Normalize whitespace and dollar formats so regex matching is robust across
// banks. Joins broken lines that look like "Ending Balance\n$1,234.56".
const cleanText = (raw: string): string => {
  let t = raw.replace(/\u00A0/g, " "); // nbsp → space
  // Collapse runs of spaces/tabs.
  t = t.replace(/[ \t]+/g, " ");
  // Trim each line.
  t = t.split(/\n/).map((l) => l.trim()).join("\n");
  // Remove blank lines.
  t = t.replace(/\n{2,}/g, "\n");
  return t;
};

// Find a dollar amount inside `text` starting at `from`. Returns the parsed
// value and the end index, or null. Accepts $1,234.56 / 1,234.56 / 1234.56,
// optional leading minus or surrounding parentheses for negatives.
const AMOUNT_RE = /\(?\s*-?\s*\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*\)?/g;

const findNextAmount = (
  text: string,
  from: number,
  windowChars = 120,
): { value: number; end: number } | null => {
  const slice = text.slice(from, from + windowChars);
  AMOUNT_RE.lastIndex = 0;
  const m = AMOUNT_RE.exec(slice);
  if (!m) return null;
  const raw = m[0];
  const v = parseAmount(raw);
  if (!Number.isFinite(v) || v === 0) return null;
  return { value: v, end: from + m.index + raw.length };
};

const KEYWORDS = [
  /ending\s+balance/gi,
  /closing\s+balance/gi,
  /end(?:ing)?\.?\s+balance/gi,
  /final\s+balance/gi,
  /balance\s+forward/gi,
  /available\s+balance/gi,
  /new\s+balance/gi,
  /balance\s+as\s+of/gi,
  /total\s+ending/gi,
];

export const extractClosingBalanceFromText = (rawText: string): number | null => {
  const text = cleanText(rawText);

  // 1) Search for any keyword and take the LAST match's following amount.
  type Hit = { keywordEnd: number; value: number };
  const hits: Hit[] = [];
  for (const re of KEYWORDS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const end = m.index + m[0].length;
      const next = findNextAmount(text, end, 160);
      if (next && Math.abs(next.value) >= 1) {
        hits.push({ keywordEnd: end, value: next.value });
      }
    }
  }
  if (hits.length > 0) {
    hits.sort((a, b) => a.keywordEnd - b.keywordEnd);
    return hits[hits.length - 1].value;
  }

  // 2) Fallback: take the LAST dollar amount > $1,000 anywhere in the document.
  let lastBig: number | null = null;
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const v = parseAmount(m[0]);
    if (Math.abs(v) > 1000) lastBig = v;
  }
  return lastBig;
};
