import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: integrations } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("is_connected", true);

    const results: Array<{
      integration: string;
      status: string;
      rows: number;
      error?: string;
    }> = [];

    for (const i of integrations ?? []) {
      const { data: logRow, error: logErr } = await supabase
        .from("sync_log")
        .insert({
          integration_name: i.integration_name,
          status: "running",
          rows_synced: 0,
        })
        .select()
        .single();

      if (logErr) {
        console.error("Failed to create sync_log row", logErr);
        continue;
      }

      // Stub: actual API sync goes here. For now mark complete with 0 rows.
      try {
        await supabase
          .from("sync_log")
          .update({
            status: "success",
            rows_synced: 0,
            completed_at: new Date().toISOString(),
          })
          .eq("id", logRow.id);

        await supabase
          .from("integration_settings")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", i.id);

        results.push({
          integration: i.integration_name,
          status: "success",
          rows: 0,
        });
      } catch (err) {
        await supabase
          .from("sync_log")
          .update({
            status: "error",
            error_message: (err as Error).message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", logRow.id);

        results.push({
          integration: i.integration_name,
          status: "error",
          rows: 0,
          error: (err as Error).message,
        });
      }
    }

    // Trigger weekly report after sync
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/weekly-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      });
    } catch (e) {
      console.error("Failed to trigger weekly-report", e);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weekly-sync error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
