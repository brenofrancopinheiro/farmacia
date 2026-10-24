const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Método inválido." }, { status: 405, headers: corsHeaders });

  try {
    const { trackingCode, document } = await request.json();
    if (typeof trackingCode !== "string" || !/^[A-Za-z0-9-]{8,40}$/.test(trackingCode))
      return Response.json({ error: "Código de rastreio inválido." }, { status: 400, headers: corsHeaders });
    if (typeof document !== "string" || !/^\d{11,14}$/.test(document.replace(/\D/g, "")))
      return Response.json({ error: "Informe um CPF ou CNPJ válido." }, { status: 400, headers: corsHeaders });

    const apiKey = Deno.env.get("RAPIDAPI_JT_TRACKING_KEY");
    if (!apiKey) throw new Error("Rastreamento ainda não configurado.");
    const parameters = new URLSearchParams({
      tracking_code: trackingCode.trim(),
      confidence_level: "high",
      document: document.replace(/\D/g, ""),
    });
    const response = await fetch(`https://correios-rastreamento-de-encomendas.p.rapidapi.com/jtexpress?${parameters}`, {
      headers: {
        "x-rapidapi-host": "correios-rastreamento-de-encomendas.p.rapidapi.com",
        "x-rapidapi-key": apiKey,
      },
    });
    const tracking = await response.json();
    if (!response.ok) throw new Error(typeof tracking?.message === "string" ? tracking.message : "Não foi possível consultar o rastreio.");
    return Response.json({ tracking }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o rastreio." }, { status: 500, headers: corsHeaders });
  }
});
