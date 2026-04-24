// CSV parser for the Google Sheets hiring roadmap.
// Uses fixed zero-based column indices matching the exact roadmap header layout:
//
// 0: Role, 1: Dept, 2: Manager, 3: Exec, 4: Date Requested, 5: Est Start Date,
// 6: Priority, 7: Base Salary, 8: Commission, 9: Exec Approve, 10: Finance Approve,
// 11: Hiring stage, 12: Reason, 13: Recruiter, 14: Start Date, 15: New Hire,
// 16: Compensation, 17: Bonus / Commission, 18: Notes

export type HireStatus = "confirmed" | "offer_sent" | "interviewing";

export type ParsedHireRow = {
  name: string;
  role: string;
  annualSalary: number;
  startDate: string; // YYYY-MM-DD
  status: HireStatus;
  notes: string;
};

const COL = {
  role: 0,
  hiringStage: 11,
  startDate: 14,
  newHire: 15,
  compensation: 16,
  notes: 18,
} as const;

const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const parseAmount = (s: string): number => {
  const cleaned = (s || "").replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const isBlankDate = (s: string): boolean => {
  const v = (s || "").trim().toLowerCase();
  if (!v) return true;
  if (["tbd", "tba", "n/a", "na", "-", "—", "?", "pending", "unknown"].includes(v)) return true;
  return false;
};

// Parse MM/DD/YYYY (or M/D/YYYY, MM-DD-YYYY) → YYYY-MM-DD.
// Falls back to Date constructor for ISO-style inputs.
const toIsoDate = (s: string): string | null => {
  const raw = (s || "").trim();
  if (!raw) return null;

  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    let [, mm, dd, yy] = mdy;
    let year = parseInt(yy, 10);
    if (yy.length === 2) year += year < 50 ? 2000 : 1900;
    const month = parseInt(mm, 10);
    const day = parseInt(dd, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const mapStatus = (s: string): HireStatus => {
  const raw = (s || "").trim().toLowerCase();
  if (!raw) return "interviewing";
  if (raw === "offer letter accepted") return "confirmed";
  if (raw === "interviewing") return "interviewing";
  // Reasonable extras for adjacent stages
  if (["confirmed", "signed", "accepted", "hired"].includes(raw)) return "confirmed";
  if (raw.includes("offer")) return "offer_sent";
  return "interviewing";
};

export const parseHiresCsv = (rawText: string): ParsedHireRow[] => {
  const text = stripBom(rawText || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Row 0 is the header — skip it. Parse every subsequent row by index.
  const rows: ParsedHireRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;

    const name = (cols[COL.newHire] || "").trim();
    if (!name) continue; // open role, no hire yet

    const startRaw = (cols[COL.startDate] || "").trim();
    if (isBlankDate(startRaw)) continue;

    const startDateIso = toIsoDate(startRaw);
    if (!startDateIso) continue;

    const role = (cols[COL.role] || "").trim();
    const annualSalary = parseAmount(cols[COL.compensation] || "");
    const status = mapStatus(cols[COL.hiringStage] || "");
    const notes = (cols[COL.notes] || "").trim();

    rows.push({ name, role, annualSalary, startDate: startDateIso, status, notes });
  }
  return rows;
};
