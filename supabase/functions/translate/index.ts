import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return Response.json(
      { error: "Método inválido." },
      { status: 405, headers: corsHeaders }
    );

  try {
    const { session, text, targetLanguage } = await request.json();
    if (
      typeof session !== "string" ||
      typeof text !== "string" ||
      !["pt", "es"].includes(targetLanguage)
    ) {
      return Response.json(
        { error: "Dados inválidos." },
        { status: 400, headers: corsHeaders }
      );
    }
    if (!text.trim() || text.length > 600)
      return Response.json(
        { error: "Texto inválido." },
        { status: 400, headers: corsHeaders }
      );

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const projectUrl = Deno.env.get("SUPABASE_URL");
    const jigsawKey = Deno.env.get("JIGSAWSTACK_API_KEY");
    if (!serviceKey || !projectUrl || !jigsawKey)
      throw new Error("Configuração de tradução indisponível.");

    const admin = createClient(projectUrl, serviceKey);
    const { data: activeSession, error: sessionError } = await admin
      .from("staff_sessions")
      .select("token")
      .eq("token", session)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (sessionError || !activeSession)
      return Response.json(
        { error: "Sessão expirada." },
        { status: 401, headers: corsHeaders }
      );

    const response = await fetch(
      "https://api.jigsawstack.com/v1/ai/translate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": jigsawKey },
        body: JSON.stringify({ text, target_language: targetLanguage }),
      }
    );
    const payload = await response.json();
    if (
      !response.ok ||
      !payload.success ||
      typeof payload.translated_text !== "string"
    )
      throw new Error("Não foi possível traduzir agora.");
    return Response.json(
      { translatedText: payload.translated_text },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível traduzir agora.",
      },
      { status: 500, headers: corsHeaders }
    );
  }
});
