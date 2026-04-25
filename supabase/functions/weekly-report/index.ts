import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://vapi-flow-insight.lovable.app";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL");

    if (!SLACK_WEBHOOK_URL) {
      return new Response(
        JSON.stringify({
          error:
            "SLACK_WEBHOOK_URL not configured. Add it as a Supabase secret.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Latest model snapshot (most recent week_start_date / created_at)
    const { data: modelWeeks } = await supabase
      .from("model_weeks")
      .select("*")
      .order("week_start_date", { ascending: true })
      .limit(1000);

    // Most recent actual
    const { data: actuals } = await supabase
      .from("weekly_actuals")
      .select("*")
      .order("week_start_date", { ascending: false })
      .limit(8);

    // Open alerts
    const { data: alerts } = await supabase
      .from("model_alerts")
      .select("id, severity, title, detail, category, week_start_date")
      .eq("status", "open")
      .order("severity", { ascending: true })
      .order("week_start_date", { ascending: false })
      .limit(20);

    const lastActual = actuals?.[0];
    const prevActual = actuals?.[1];
    const openingBalance = lastActual?.closing_cash_balance ?? null;

    // Net CF actual = closing - prev closing
    const actualNet =
      lastActual && prevActual
        ? Number(lastActual.closing_cash_balance) -
          Number(prevActual.closing_cash_balance)
        : null;

    // Modeled net CF for that week
    const modeledForLastActual = lastActual
      ? modelWeeks?.find(
          (w) => w.week_start_date === lastActual.week_start_date,
        )
      : null;
    const modeledNet = modeledForLastActual?.net_change ?? null;

    // Runway: weeks from latest model snapshot until balance hits 0
    let runwayMonths: number | null = null;
    let cashOutDate: string | null = null;
    if (modelWeeks && modelWeeks.length > 0 && openingBalance != null) {
      // Use forward-looking model from latest actual onward
      const fwd = modelWeeks.filter(
        (w) => w.week_start_date >= (lastActual?.week_start_date ?? ""),
      );
      let bal = Number(openingBalance);
      let weeks = 0;
      for (const w of fwd) {
        bal += Number(w.net_change ?? 0);
        weeks += 1;
        if (bal <= 0) {
          cashOutDate = w.week_start_date as string;
          break;
        }
      }
      runwayMonths = weeks > 0 ? Number((weeks / 4.345).toFixed(1)) : null;
    }

    const weekOf = lastActual ? fmtDate(lastActual.week_start_date) : "—";

    // --- Build Slack Block Kit ---
    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `Vapi Cash Flow — Week of ${weekOf}` },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Opening balance*\n${fmtMoney(openingBalance)}`,
          },
          {
            type: "mrkdwn",
            text: `*Last week net CF*\n${fmtMoney(actualNet)} actual vs ${fmtMoney(modeledNet)} modeled`,
          },
          {
            type: "mrkdwn",
            text: `*Runway*\n${runwayMonths != null ? `${runwayMonths} months` : "—"}`,
          },
          {
            type: "mrkdwn",
            text: `*Cash-out date*\n${cashOutDate ? fmtDate(cashOutDate) : "Beyond model horizon"}`,
          },
        ],
      },
      { type: "divider" },
    ];

    if (alerts && alerts.length > 0) {
      const lines = alerts
        .slice(0, 10)
        .map((a) => {
          const emoji =
            a.severity === "critical"
              ? "🔴"
              : a.severity === "warning"
                ? "🟡"
                : "🔵";
          const title = a.title ?? `${a.category} variance`;
          const wk = a.week_start_date ? ` (${fmtDate(a.week_start_date)})` : "";
          return `${emoji} ${title}${wk}`;
        })
        .join("\n");
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Open alerts (${alerts.length})*\n${lines}`,
        },
      });
    } else {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "*Open alerts*\n_No open alerts_ ✅" },
      });
    }

    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View full model" },
          url: APP_URL,
          style: "primary",
        },
      ],
    });

    const payload = {
      text: `Vapi Cash Flow — Week of ${weekOf}`,
      blocks,
    };

    const slackResp = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const slackText = await slackResp.text();
    if (!slackResp.ok) {
      console.error("Slack webhook failed:", slackResp.status, slackText);
      return new Response(
        JSON.stringify({
          error: `Slack webhook returned ${slackResp.status}: ${slackText}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        week_of: weekOf,
        alerts_sent: alerts?.length ?? 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("weekly-report error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
