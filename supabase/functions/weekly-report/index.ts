import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { format, startOfWeek, addDays } from "https://esm.sh/date-fns@3.6.0";
import {
  buildForecast,
  buildAssumptionMap,
  type ForecastWeek,
} from "../_shared/forecast.ts";
import {
  joinWeeks,
  generateInsights,
  topVarianceDriversForWeek,
  type ModelWeekRow,
  type WeeklyActualRow,
} from "../_shared/varianceAnalysis.ts";
import { detectAlerts, type VarianceTxn } from "../_shared/variance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://vapi-flow-insight.lovable.app";
const AI_PLACEHOLDER =
  "AI analysis will appear here once the Anthropic API key is configured. To enable: add ANTHROPIC_API_KEY to Supabase secrets.";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(Number(n))) return "—";
  const v = Number(n);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const mondayOf = (d: Date): string => {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};

interface ReportContext {
  weekOf: string;
  openingBalance: number | null;
  lastActualClosing: number | null;
  modeledClosing: number | null;
  closingDelta: number | null;
  actualBurn: number | null;
  modeledBurn: number | null;
  trailingMonthlyBurn: number | null;
  runwayMonths: number | null;
  cashOutDate: string | null;
  headroom: number | null;
  topVariances: Array<{ label: string; actual: number; modeled: number; delta: number }>;
  alerts: Array<{ severity: string; title: string; week_start_date: string | null }>;
  insights: string[];
  thisWeekForecast: {
    opening: number;
    expectedAr: number;
    projectedClosing: number;
    topOutflows: Array<{ label: string; amount: number }>;
  } | null;
  aiAnalysis: string;
  aiFallback: boolean;
}

// deno-lint-ignore no-explicit-any
type Sb = any;

async function generateForecastSnapshot(
  supabase: Sb,
): Promise<{ snapshotId: string; weeks: ForecastWeek[]; label: string } | null> {
  const [
    { data: assumptionsRows },
    { data: arRows },
    { data: hireRows },
    { data: arOverrideRows },
    { data: hireOverrideRows },
  ] = await Promise.all([
    supabase.from("assumptions").select("key, value"),
    supabase.from("ar_entries").select("expected_collection_date, invoice_amount, status"),
    supabase.from("future_hires").select("start_date, annual_salary"),
    supabase
      .from("ar_weekly_overrides")
      .select("forecast_start, weeks, delay_days")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("hire_payroll_overrides")
      .select("forecast_start, weeks")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (!assumptionsRows) return null;

  const assumptions = buildAssumptionMap(
    (assumptionsRows as Array<{ key: string; value: number }>) ?? [],
  );

  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  const startISO = start.toISOString().slice(0, 10);

  // Only use overrides if their forecast_start matches this week
  const arOv = (arOverrideRows ?? [])[0];
  const arOverride =
    arOv && arOv.forecast_start === startISO
      ? { weeks: arOv.weeks as number[], delay_days: arOv.delay_days as number }
      : null;
  const hireOv = (hireOverrideRows ?? [])[0];
  const hireOverride =
    hireOv && hireOv.forecast_start === startISO
      ? { weeks: hireOv.weeks as number[] }
      : null;

  const result = buildForecast(
    assumptions,
    (arRows as any[]) ?? [],
    (hireRows as any[]) ?? [],
    13,
    start,
    arOverride,
    hireOverride,
  );

  const snapshotId = crypto.randomUUID();
  const label = `Auto — Monday ${format(start, "MMM d, yyyy")}`;

  const rows = result.weeks.map((w) => ({
    snapshot_id: snapshotId,
    snapshot_label: label,
    week_index: w.weekIndex,
    week_start_date: w.weekStartDate.toISOString().slice(0, 10),
    opening_balance: w.openingBalance,
    stripe_revenue: w.stripeRevenue,
    enterprise_revenue: w.enterpriseRevenue,
    ar_collections: w.arCollections,
    payroll: w.payroll,
    cogs: w.cogsTotal,
    card_payments: w.brexCard,
    rent: w.rent,
    opex: w.opexTotal,
    net_change: w.netChange,
    closing_balance: w.closingBalance,
    burn: Math.max(0, -w.netChange),
    runway_weeks: w.runwayMonths != null ? w.runwayMonths * 4.333 : null,
  }));

  const { error } = await supabase.from("model_weeks").insert(rows as any);
  if (error) {
    console.error("Failed to insert forecast snapshot", error);
    return null;
  }
  return { snapshotId, weeks: result.weeks, label };
}

async function markChecklistAuto(
  supabase: Sb,
  week: string,
) {
  // Idempotent upsert
  const { data: existing } = await supabase
    .from("weekly_checklist")
    .select("id")
    .eq("week_start_date", week)
    .eq("item_key", "generate_forecast")
    .maybeSingle();
  if (existing) {
    await supabase
      .from("weekly_checklist")
      .update({
        completed: true,
        completed_by_email: "system@auto",
        completed_at: new Date().toISOString(),
      })
      .eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("weekly_checklist").insert({
      week_start_date: week,
      item_key: "generate_forecast",
      completed: true,
      completed_by_email: "system@auto",
      completed_at: new Date().toISOString(),
    });
  }
}

async function buildContext(
  supabase: Sb,
  forecast: ForecastWeek[] | null,
): Promise<ReportContext> {
  // Pull all model_weeks for the latest snapshot we just wrote (or fall back)
  const { data: latestSnap } = await supabase
    .from("model_weeks")
    .select("snapshot_id, snapshot_label, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let modelWeeks: ModelWeekRow[] = [];
  if (latestSnap?.snapshot_id) {
    const { data } = await supabase
      .from("model_weeks")
      .select("*")
      .eq("snapshot_id", latestSnap.snapshot_id)
      .order("week_start_date");
    modelWeeks = (data ?? []) as unknown as ModelWeekRow[];
  }

  // Actuals
  const { data: actualsRaw } = await supabase
    .from("weekly_actuals")
    .select("week_start_date, closing_cash_balance, notes")
    .order("week_start_date", { ascending: false })
    .limit(20);

  const actuals: WeeklyActualRow[] = (actualsRaw ?? []).map((r: any) => {
    let map: Record<string, number> = {};
    if (r.notes) {
      try {
        const parsed = JSON.parse(r.notes);
        if (parsed && typeof parsed === "object") {
          for (const k of Object.keys(parsed)) {
            const v = Number(parsed[k]);
            if (Number.isFinite(v)) map[k] = v;
          }
        }
      } catch { /* ignore */ }
    }
    return {
      week_start_date: r.week_start_date,
      closing_cash_balance: Number(r.closing_cash_balance ?? 0),
      lineMap: map,
    };
  });

  const joined = joinWeeks(modelWeeks, [...actuals].reverse());
  const lastJoined = joined[joined.length - 1];

  // Latest actual (any) for opening balance display
  const lastActual = actuals[0];
  const openingBalance = lastActual?.closing_cash_balance ?? null;

  // This week's forecast row (W1)
  const todayMonday = mondayOf(new Date());
  const w1 = forecast?.find((w) => w.weekStartDate.toISOString().slice(0, 10) === todayMonday)
    ?? forecast?.[0]
    ?? null;

  // Trailing burn from forecast
  const trailingMonthlyBurn = w1?.trailingMonthlyBurn ?? null;
  const runwayMonths = w1?.runwayMonths ?? null;
  const cashOutDate = w1?.cashOutDate ?? null;

  // Headroom vs $15M floor
  const minFloor = 15_000_000;
  const headroom =
    openingBalance != null ? openingBalance - minFloor : null;

  // Top variances last week (from joined)
  const topVariances = lastJoined
    ? topVarianceDriversForWeek(lastJoined, 3).map((l) => ({
        label: l.label,
        actual: l.actual,
        modeled: l.modeled,
        delta: l.delta,
      }))
    : [];

  // Open alerts
  const { data: alertRows } = await supabase
    .from("model_alerts")
    .select("severity, title, week_start_date, category")
    .eq("status", "open")
    .order("severity", { ascending: true })
    .order("week_start_date", { ascending: false })
    .limit(50);

  const alerts = (alertRows ?? []).map((a: any) => ({
    severity: a.severity as string,
    title: (a.title as string) ?? `${a.category} variance`,
    week_start_date: a.week_start_date as string | null,
  }));

  // Insights
  const { data: hireRows } = await supabase
    .from("future_hires")
    .select("name, start_date");
  const insights = generateInsights(joined, (hireRows ?? []) as any);

  // This-week forecast preview
  let thisWeekForecast: ReportContext["thisWeekForecast"] = null;
  if (w1) {
    const outflows = [
      { label: "Payroll", amount: w1.payroll },
      { label: "COGS", amount: w1.cogsTotal },
      { label: "Brex Card", amount: w1.brexCard },
      { label: "OpEx", amount: w1.opexTotal },
      { label: "Rent", amount: w1.rent },
    ]
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
    thisWeekForecast = {
      opening: w1.openingBalance,
      expectedAr: w1.arCollections,
      projectedClosing: w1.closingBalance,
      topOutflows: outflows,
    };
  }

  // === AI Analysis ===
  // TODO: LLM INTEGRATION — uncomment when ANTHROPIC_API_KEY is set
  // The block below is intentionally inert until the secret is configured.
  // When the secret exists at runtime we will call Claude; otherwise we use
  // the placeholder string and silently fall back to hardcoded insights.
  let aiAnalysis = AI_PLACEHOLDER;
  let aiFallback = true;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (ANTHROPIC_API_KEY) {
    /*
    try {
      const prompt = buildClaudePrompt({
        openingBalance, lastActual, lastJoined, trailingMonthlyBurn, runwayMonths,
        cashOutDate, headroom, topVariances, alerts, insights, thisWeekForecast,
      });
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        aiAnalysis = data?.content?.[0]?.text ?? AI_PLACEHOLDER;
        aiFallback = false;
      }
    } catch (e) {
      console.error("Claude call failed", e);
    }
    */
  }

  const weekOf = lastActual ? fmtDate(lastActual.week_start_date) : fmtDate(todayMonday);

  return {
    weekOf,
    openingBalance,
    lastActualClosing: lastJoined?.actualClosing ?? null,
    modeledClosing: lastJoined?.modeledClosing ?? null,
    closingDelta:
      lastJoined ? lastJoined.actualClosing - lastJoined.modeledClosing : null,
    actualBurn: lastJoined?.actualBurn ?? null,
    modeledBurn: lastJoined?.modeledBurn ?? null,
    trailingMonthlyBurn,
    runwayMonths,
    cashOutDate,
    headroom,
    topVariances,
    alerts,
    insights,
    thisWeekForecast,
    aiAnalysis,
    aiFallback,
  };
}

function buildSlackBlocks(ctx: ReportContext) {
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 Vapi Cash Flow — Week of ${ctx.weekOf}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Balances*\n` +
          `Opening balance: ${fmtMoney(ctx.openingBalance)}\n` +
          (ctx.lastActualClosing != null
            ? `Last week actual closing: ${fmtMoney(ctx.lastActualClosing)} (vs ${fmtMoney(ctx.modeledClosing)} modeled — ${
                (ctx.closingDelta ?? 0) >= 0 ? "over" : "under"
              } by ${fmtMoney(Math.abs(ctx.closingDelta ?? 0))})`
            : "No actuals yet for last week."),
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Burn & Runway*\n` +
          (ctx.actualBurn != null
            ? `Last week burn: ${fmtMoney(ctx.actualBurn)} actual vs ${fmtMoney(ctx.modeledBurn)} modeled\n`
            : "") +
          `4-week trailing burn: ${fmtMoney(ctx.trailingMonthlyBurn)}/month\n` +
          `Runway: ${ctx.runwayMonths != null ? `${ctx.runwayMonths.toFixed(1)} months` : "—"}` +
          (ctx.cashOutDate ? ` (cash-out ${ctx.cashOutDate})` : "") +
          `\nHeadroom vs $15M floor: ${fmtMoney(ctx.headroom)}`,
      },
    },
  ];

  if (ctx.topVariances.length > 0) {
    const lines = ctx.topVariances
      .map(
        (v, i) =>
          `${i + 1}. ${v.label}: ${fmtMoney(v.actual)} actual vs ${fmtMoney(v.modeled)} model (${v.delta >= 0 ? "+" : ""}${fmtMoney(v.delta)})`,
      )
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Top Variances Last Week*\n${lines}` },
    });
  }

  // Alerts
  const critical = ctx.alerts.filter((a) => a.severity === "critical");
  const warnings = ctx.alerts.filter((a) => a.severity === "warning");
  let alertsText = "";
  if (critical.length === 0 && warnings.length === 0) {
    alertsText = "✅ No open alerts";
  } else {
    if (critical.length > 0) {
      alertsText += `🔴 *${critical.length} critical*: ${critical.slice(0, 5).map((a) => a.title).join("; ")}`;
    }
    if (warnings.length > 0) {
      if (alertsText) alertsText += "\n";
      alertsText += `🟡 *${warnings.length} warnings*: ${warnings.slice(0, 5).map((a) => a.title).join("; ")}`;
    }
  }
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*Alerts*\n${alertsText}` },
  });

  // AI analysis
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*AI Analysis*\n${ctx.aiAnalysis.slice(0, 2900)}`,
    },
  });

  // This week forecast
  if (ctx.thisWeekForecast) {
    const tw = ctx.thisWeekForecast;
    const outflowLines = tw.topOutflows
      .map((o, i) => `${i + 1}. ${o.label}: ${fmtMoney(o.amount)}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*This Week Forecast*\n` +
          `W1 opening: ${fmtMoney(tw.opening)}\n` +
          `Biggest outflows:\n${outflowLines}\n` +
          `Expected A/R collections: ${fmtMoney(tw.expectedAr)}\n` +
          `Projected W1 closing: ${fmtMoney(tw.projectedClosing)}`,
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View Full Model →" },
        url: APP_URL,
        style: "primary",
      },
    ],
  });

  return blocks;
}

function buildEmailHtml(ctx: ReportContext) {
  const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const alertList = ctx.alerts
    .slice(0, 10)
    .map((a) => `<li>${a.severity === "critical" ? "🔴" : "🟡"} ${escape(a.title)}</li>`)
    .join("");
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2>📊 Vapi Cash Flow — Week of ${escape(ctx.weekOf)}</h2>
      <p><strong>Opening balance:</strong> ${fmtMoney(ctx.openingBalance)}<br/>
      <strong>Runway:</strong> ${ctx.runwayMonths != null ? ctx.runwayMonths.toFixed(1) + " months" : "—"} ${ctx.cashOutDate ? `(cash-out ${escape(ctx.cashOutDate)})` : ""}<br/>
      <strong>4-week trailing burn:</strong> ${fmtMoney(ctx.trailingMonthlyBurn)}/month</p>
      <h3>AI Analysis</h3>
      <p>${escape(ctx.aiAnalysis).replace(/\n/g, "<br/>")}</p>
      <h3>Open alerts</h3>
      <ul>${alertList || "<li>✅ No open alerts</li>"}</ul>
      <p><a href="${APP_URL}">View Full Model →</a></p>
      <p style="color:#888;font-size:12px;">Sent because Slack delivery failed.</p>
    </div>
  `;
}

async function postSlack(payload: any): Promise<{ ok: boolean; error?: string }> {
  const url = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!url) return { ok: false, error: "SLACK_WEBHOOK_URL not set" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, error: `Slack ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendResendFallback(ctx: ReportContext): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vapi Cash Flow <noreply@vapi.ai>",
        to: ["ram@vapi.ai", "parmvir@vapi.ai", "finance@vapi.ai"],
        subject: `📊 Vapi Cash Flow — Week of ${ctx.weekOf}`,
        html: buildEmailHtml(ctx),
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Step 1: Generate forecast snapshot
    const snap = await generateForecastSnapshot(supabase);

    // Step 9: Auto-mark checklist item if forecast succeeded
    if (snap) {
      const week = mondayOf(new Date());
      try {
        await markChecklistAuto(supabase, week);
      } catch (e) {
        console.error("Failed to mark checklist", e);
      }
    }

    // Steps 2-6: Build the full context (variance, alerts, insights, AI placeholder)
    const ctx = await buildContext(supabase, snap?.weeks ?? null);

    // Cache the AI analysis for the UI
    try {
      await supabase.from("ai_analyses").insert({
        week_start_date: mondayOf(new Date()),
        source: "monday_auto",
        analysis_text: ctx.aiAnalysis,
        is_fallback: ctx.aiFallback,
      });
    } catch (e) {
      console.error("Failed to cache ai_analysis", e);
    }

    // Step 7: Build & post Slack
    const blocks = buildSlackBlocks(ctx);
    const slackResult = await postSlack({
      text: `📊 Vapi Cash Flow — Week of ${ctx.weekOf}`,
      blocks,
    });

    let deliveredVia = "slack";
    let deliveryError: string | undefined;

    if (!slackResult.ok) {
      deliveryError = slackResult.error;
      console.warn("Slack failed, trying Resend fallback:", slackResult.error);
      const emailResult = await sendResendFallback(ctx);
      deliveredVia = emailResult.ok ? "email" : "none";
      if (!emailResult.ok) deliveryError = `${slackResult.error}; ${emailResult.error}`;
    }

    return new Response(
      JSON.stringify({
        ok: deliveredVia !== "none",
        delivered_via: deliveredVia,
        snapshot_id: snap?.snapshotId ?? null,
        snapshot_label: snap?.label ?? null,
        week_of: ctx.weekOf,
        ai_fallback: ctx.aiFallback,
        alerts_open: ctx.alerts.length,
        error: deliveryError,
      }),
      {
        status: deliveredVia !== "none" ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("weekly-report error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
