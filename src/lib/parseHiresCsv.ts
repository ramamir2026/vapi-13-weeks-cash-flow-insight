// Parser for the Hiring Roadmap CSV/sheet export.
// Resolves columns by HEADER NAME (normalized tokens), not fixed indices, so
// it works across variants of the Hiring Roadmap template (Q3/Q4 sheets,
// renamed columns, reordered columns).
export type HireStatus = "confirmed" | "offer_sent" | "interviewing";

export interface ParsedHireRow {
  name: string;
  role: string;
  annualSalary: number;
  startDate: string; // YYYY-MM-DD
  status: HireStatus;
  notes: string;
}

// ---- helpers ---------------------------------------------------------------

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

const stripCell = (s: string | undefined): string =>
  (s ?? "").replace(/^"|"$/g, "").replace(/""/g, '"').trim();

const splitLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
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

const ROLE_TOKENS = new Set(["role", "position", "title", "jobtitle"]);
const SALARY_TOKENS = new Set([
  "basesalary",
  "salary",
  "annualsalary",
  "base",
  "compensation",
]);
const STAGE_TOKENS = new Set(["hiringstage", "stage", "status"]);
const NAME_TOKENS = new Set(["newhire", "candidate", "name", "employee"]);
const NOTES_TOKENS = new Set(["notes", "note", "comment", "comments"]);
const START_PREFERRED = new Set([
  "eststartdate",
  "estimatedstartdate",
  "targetstartdate",
]);
const START_FALLBACK = new Set(["startdate", "start"]);

type ColMap = {
  role: number;
  startDate: number;
  salary: number;
  stage: number;
  name: number;
  notes: number;
};

const buildColMap = (headerCells: string[]): ColMap => {
  const map: ColMap = {
    role: -1,
    startDate: -1,
    salary: -1,
    stage: -1,
    name: -1,
    notes: -1,
  };
  // First pass: everything except startDate, plus preferred start tokens.
  for (let i = 0; i < headerCells.length; i++) {
    const n = norm(headerCells[i]);
    if (!n) continue;
    if (map.role === -1 && ROLE_TOKENS.has(n)) map.role = i;
    if (map.salary === -1 && SALARY_TOKENS.has(n)) map.salary = i;
    if (map.stage === -1 && STAGE_TOKENS.has(n)) map.stage = i;
    if (map.name === -1 && NAME_TOKENS.has(n)) map.name = i;
    if (map.notes === -1 && NOTES_TOKENS.has(n)) map.notes = i;
    if (map.startDate === -1 && START_PREFERRED.has(n)) map.startDate = i;
  }
  // Second pass: fallback start-date tokens only if no preferred column found.
  if (map.startDate === -1) {
    for (let i = 0; i < headerCells.length; i++) {
      const n = norm(headerCells[i]);
      if (START_FALLBACK.has(n)) {
        map.startDate = i;
        break;
      }
    }
  }
  return map;
};

const isHeaderRow = (cells: string[]): boolean => {
  let hasRoleOrName = false;
  let hasSalary = false;
  for (const c of cells) {
    const n = norm(c);
    if (!n) continue;
    if (ROLE_TOKENS.has(n) || NAME_TOKENS.has(n)) hasRoleOrName = true;
    if (SALARY_TOKENS.has(n)) hasSalary = true;
    if (hasRoleOrName && hasSalary) return true;
  }
  return false;
};

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

const parseDate = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return null;
  const flat = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!flat || flat === "tbd" || flat === "na" || flat === "tba") return null;

  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    const y = +iso[1];
    const m = +iso[2];
    const d = +iso[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  // M/D/YYYY or M/D/YY
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (us) {
    const m = +us[1];
    const d = +us[2];
    let y = +us[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  // Last-resort fallback.
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  }
  return null;
};

const stageToStatus = (raw: string): HireStatus => {
  const s = raw.toLowerCase();
  if (s.includes("accepted") || s.includes("hired") || s.includes("signed")) {
    return "confirmed";
  }
  if (s.includes("offer")) return "offer_sent";
  return "interviewing";
};

// ---- main entry ------------------------------------------------------------

export const parseHiresCsv = (text: string): ParsedHireRow[] => {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  // Find the header row within the first ~10 non-empty rows.
  let headerIdx = -1;
  let headerCells: string[] = [];
  let nonEmptySeen = 0;
  for (let i = 0; i < lines.length && nonEmptySeen < 10; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    nonEmptySeen++;
    const cells = splitLine(line);
    if (isHeaderRow(cells)) {
      headerIdx = i;
      headerCells = cells;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const col = buildColMap(headerCells);
  if (col.salary === -1 || (col.role === -1 && col.name === -1)) return [];

  const results: ParsedHireRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = splitLine(line);
    if (cols.every((c) => !c)) continue;

    const role = col.role >= 0 ? stripCell(cols[col.role]) : "";
    const startRaw = col.startDate >= 0 ? stripCell(cols[col.startDate]) : "";
    const salaryRaw =
      col.salary >= 0
        ? stripCell(cols[col.salary]).replace(/[$,\s]/g, "")
        : "";
    const stageRaw = col.stage >= 0 ? stripCell(cols[col.stage]) : "";
    const nameRaw = col.name >= 0 ? stripCell(cols[col.name]) : "";
    const notes = col.notes >= 0 ? stripCell(cols[col.notes]) : "";

    const startDate = parseDate(startRaw);
    if (!startDate) continue;

    const salary = parseFloat(salaryRaw);
    if (!Number.isFinite(salary) || salary <= 0) continue;

    const name = nameRaw || role;
    if (!name) continue;

    results.push({
      name,
      role: role || name,
      annualSalary: salary,
      startDate,
      status: stageToStatus(stageRaw),
      notes,
    });
  }

  return results;
};
