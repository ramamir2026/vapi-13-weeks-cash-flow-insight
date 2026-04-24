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
    const text = tc.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    parts.push(text);
  }
  return parts.join("\n");
};

export const extractClosingBalanceFromText = (text: string): number | null => {
  // Search for explicit labels. Statements usually end with "Ending Balance $X,XXX.XX".
  const patterns = [
    /(?:ending|closing|final|new)\s+balance[^\d\-(]{0,20}([\-(]?\$?[\d,]+\.\d{2}\)?)/gi,
    /balance\s+as\s+of[^\d\-(]{0,40}([\-(]?\$?[\d,]+\.\d{2}\)?)/gi,
    /total\s+ending[^\d\-(]{0,20}([\-(]?\$?[\d,]+\.\d{2}\)?)/gi,
  ];
  for (const re of patterns) {
    const matches = [...text.matchAll(re)];
    if (matches.length > 0) {
      // Use the LAST match — closing balance usually appears at the end.
      const last = matches[matches.length - 1];
      const v = parseAmount(last[1]);
      if (v) return v;
    }
  }
  return null;
};
