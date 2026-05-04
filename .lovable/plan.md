Add Assumptions, AR Schedule, and Future Hires sheets to the Excel export.

### 1. `src/lib/exportExcel.ts`

**Update signature** (line 80) to accept optional `extras`:
```ts
export const exportForecastToExcel = async (
  forecast: ForecastResult,
  actuals: Record<string, number> = {},
  extras?: {
    assumptions?: Array<{ key: string; value: string | number; category: string }>;
    arEntries?: Array<{
      customer: string;
      invoice_amount: number;
      due_date?: string;
      expected_collection_date?: string;
      status?: string;
      probability?: number;
    }>;
    futureHires?: Array<{
      role: string;
      department?: string;
      start_date?: string;
      annual_salary?: number;
    }>;
  }
) => {
```

**Append three new sheets** after the Variance loop (before `// ===== Save =====` at line 520):

- **Assumptions** (if provided): columns Category (20), Key (35), Value (18); bold + frozen header; sorted by category then key.
- **AR Schedule** (if provided): columns Customer | Invoice Amount | Due Date | Expected Collection | Status | Probability; bold + frozen header; sorted by `expected_collection_date` asc; Invoice Amount `$#,##0`; Probability `0%` (divide by 100 if value >1 to handle either storage convention).
- **Future Hires** (if provided): columns Role | Department | Start Date | Annual Salary | Monthly Cost; bold + frozen header; sorted by `start_date` asc; Monthly Cost = annual/12; both salary cols `$#,##0`.

Each sheet only added when its array exists and is non-empty.

### 2. `src/pages/Dashboard.tsx`

Hooks already in scope (lines 74–76):
- `assumptions` ← `useAssumptions()`
- `arEntries` ← `useArEntries()`
- `hires` ← `useFutureHires()`

Update `handleDownload` (line 240):
```ts
const handleDownload = () => {
  void exportForecastToExcel(forecast, actualsData?.map ?? {}, {
    assumptions,
    arEntries,
    futureHires: hires,
  });
};
```

No new hooks added; main forecast + variance sheets unchanged.
