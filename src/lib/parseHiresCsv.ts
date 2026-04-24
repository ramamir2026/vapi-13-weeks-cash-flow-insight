export type HireStatus = "confirmed" | "offer_sent" | "interviewing";

export interface ParsedHireRow {
  name: string;
  role: string;
  annualSalary: number;
  startDate: string; // YYYY-MM-DD
  status: HireStatus;
  notes: string;
}

export const parseHiresCsv = (text: string): ParsedHireRow[] => {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const results: ParsedHireRow[] = [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        quoted = !quoted;
      } else if (ch === "," && !quoted) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitLine(line);
    if (cols.length < 16) continue;

    const name = cols[15].replace(/"/g, "").trim();
    const startDateRaw = cols[14].replace(/"/g, "").trim();
    const salaryRaw = cols[16]
      ? cols[16].replace(/"/g, "").replace(/[$,]/g, "").trim()
      : "";
    const role = cols[0].replace(/"/g, "").trim();
    const hiringStage = cols[11].replace(/"/g, "").trim();
    const notes = cols[18] ? cols[18].replace(/"/g, "").trim() : "";

    if (!name || !startDateRaw || startDateRaw === "TBD") continue;

    const salary = parseFloat(salaryRaw) || 0;
    if (salary === 0) continue;

    const dateParts = startDateRaw.split("/");
    let isoDate = "";
    if (dateParts.length === 3) {
      const m = dateParts[0].padStart(2, "0");
      const d = dateParts[1].padStart(2, "0");
      const y = dateParts[2];
      isoDate = `${y}-${m}-${d}`;
    } else {
      continue;
    }

    let status: HireStatus = "interviewing";
    const stage = hiringStage.toLowerCase();
    if (stage.includes("offer letter accepted") || stage.includes("hired")) status = "confirmed";
    else if (stage.includes("offer")) status = "offer_sent";

    results.push({
      name,
      role,
      annualSalary: salary,
      startDate: isoDate,
      status,
      notes,
    });
  }

  return results;
};
