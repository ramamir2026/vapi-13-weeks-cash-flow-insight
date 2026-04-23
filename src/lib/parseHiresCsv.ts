// Lightweight CSV parser for Future Hires imports. No external deps.
// Tolerant of common header variations.

export type HireStatus = "confirmed" | "offer_sent" | "interviewing";

export type ParsedHireRow = {
  name: string;
  role: string;
  annualSalary: number;
  startDate: string; // YYYY-MM-DD
  status: HireStatus;
  notes: string;
};

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

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Field = "name" | "role" | "salary" | "startDate" | "status" | "notes";

const HEADER_MAP: Record<string, Field> = {
  name: "name",
  fullname: "name",
  hire: "name",
  role: "role",
  title: "role",
  position: "role",
  jobtitle: "role",
  salary: "salary",
  annualsalary: "salary",
  base: "salary",
  basesalary: "salary",
  comp: "salary",
  startdate: "startDate",
  start: "startDate",
  date: "startDate",
  status: "status",
  stage: "status",
  notes: "notes",
  note: "notes",
  comments: "notes",
};

const parseAmount = (s: string): number => {
  const cleaned = (s || "").replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const toIsoDate = (s: string): string | null => {
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const mapStatus = (s: string): HireStatus => {
  const n = normalize(s || "");
  if (!n) return "interviewing";
  if (["confirmed", "signed", "accepted", "yes", "hired"].includes(n)) return "confirmed";
  if (
    n.includes("offer") ||
    ["offered", "offersent", "offerextended"].includes(n)
  ) return "offer_sent";
  return "interviewing";
};

export const parseHiresCsv = (text: string): ParsedHireRow[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Find header row
  let headerIdx = -1;
  let mapped: (Field | null)[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = splitCsvLine(lines[i]);
    const m = cols.map((c) => HEADER_MAP[normalize(c)] ?? null);
    if (m.filter(Boolean).length >= 2) {
      headerIdx = i;
      mapped = m;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const rows: ParsedHireRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;

    const rec: Partial<Record<Field, string>> = {};
    cols.forEach((val, idx) => {
      const k = mapped[idx];
      if (k) rec[k] = val;
    });

    const name = (rec.name || "").trim();
    const role = (rec.role || "").trim();
    if (!name || !role) continue;
    if (/^(total|grand total|subtotal)/i.test(name)) continue;

    const annualSalary = parseAmount(rec.salary || "");
    const startDate = toIsoDate(rec.startDate || "") || new Date().toISOString().slice(0, 10);
    const status = mapStatus(rec.status || "");
    const notes = (rec.notes || "").trim();

    rows.push({ name, role, annualSalary, startDate, status, notes });
  }
  return rows;
};
