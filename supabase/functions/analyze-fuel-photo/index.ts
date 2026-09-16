import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

type JsonRecord = Record<string, unknown>;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(status: number, body: JsonRecord) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

function imageBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return Number.POSITIVE_INFINITY;
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  return Math.floor((base64.length * 3) / 4);
}

function extractOutputText(payload: JsonRecord): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as JsonRecord).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as JsonRecord).text;
      if (typeof text === "string") return text;
    }
  }
  return null;
}

const resultSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "safeToAnalyze",
    "summary",
    "items",
    "clarificationQuestion",
    "clarificationOptions",
    "estimate",
    "confidence",
  ],
  properties: {
    safeToAnalyze: { type: "boolean" },
    summary: { type: "string", maxLength: 120 },
    items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "confidence", "portionHint"],
        properties: {
          label: { type: "string", maxLength: 50 },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          portionHint: { type: "string", maxLength: 50 },
        },
      },
    },
    clarificationQuestion: { type: ["string", "null"], maxLength: 100 },
    clarificationOptions: {
      type: "array",
      maxItems: 3,
      items: { type: "string", maxLength: 40 },
    },
    estimate: {
      type: "object",
      additionalProperties: false,
      required: [
        "caloriesMin",
        "caloriesMax",
        "carbsMinG",
        "carbsMaxG",
        "proteinMinG",
        "proteinMaxG",
        "fatMinG",
        "fatMaxG",
      ],
      properties: {
        caloriesMin: { type: "integer", minimum: 0, maximum: 3000 },
        caloriesMax: { type: "integer", minimum: 0, maximum: 3000 },
        carbsMinG: { type: "integer", minimum: 0, maximum: 400 },
        carbsMaxG: { type: "integer", minimum: 0, maximum: 400 },
        proteinMinG: { type: "integer", minimum: 0, maximum: 200 },
        proteinMaxG: { type: "integer", minimum: 0, maximum: 200 },
        fatMinG: { type: "integer", minimum: 0, maximum: 200 },
        fatMaxG: { type: "integer", minimum: 0, maximum: 200 },
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!request.headers.get("Authorization")) return json(401, { error: "missing_authorization" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json(503, { error: "ai_not_configured" });

  let body: JsonRecord;
  try {
    body = (await request.json()) as JsonRecord;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/i);
  const mime = match?.[1]?.toLowerCase();
  if (!mime || !ALLOWED_MIME.has(mime)) {
    return json(400, { error: "unsupported_image", message: "Użyj zdjęcia JPG, PNG lub WebP." });
  }
  if (imageBytes(imageDataUrl) > MAX_IMAGE_BYTES) {
    return json(413, { error: "image_too_large", message: "Zdjęcie po przygotowaniu jest za duże." });
  }

  const session = body.session && typeof body.session === "object" ? body.session : {};
  const model = Deno.env.get("OPENAI_FUEL_MODEL") || "gpt-4.1-mini";
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 700,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Jesteś ostrożnym analizatorem zdjęć posiłków dla sportowców. Odpowiadasz po polsku. Rozpoznajesz wyłącznie jedzenie i napoje. Nie identyfikujesz osób, nie diagnozujesz alergii i nie udajesz dokładności laboratoryjnej. Podawaj szerokie, realistyczne zakresy makro. Zadaj najwyżej jedno krótkie pytanie tylko wtedy, gdy niewidoczny składnik (np. olej, sos, farsz) istotnie zmienia wynik. Jeśli w kadrze widać osobę, dokument, ekran albo inne dane osobowe, ustaw safeToAnalyze=false i nie analizuj posiłku.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Oceń widoczny posiłek. Kontekst najbliższej jednostki: ${JSON.stringify(session)}. Nie oceniaj, czy posiłek pasuje do treningu — zwróć tylko skład, jedną najważniejszą niepewność i orientacyjne zakresy.`,
            },
            { type: "input_image", image_url: imageDataUrl, detail: "low" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "fuel_photo_analysis",
          strict: true,
          schema: resultSchema,
        },
      },
    }),
  });

  if (!apiResponse.ok) {
    console.error("Fuel photo analysis failed", {
      status: apiResponse.status,
      requestId: apiResponse.headers.get("x-request-id"),
    });
    return json(502, {
      error: "analysis_provider_error",
      message: "Analiza zdjęcia jest chwilowo niedostępna. Opisz posiłek jednym zdaniem.",
    });
  }

  const payload = (await apiResponse.json()) as JsonRecord;
  const outputText = extractOutputText(payload);
  if (!outputText) return json(502, { error: "empty_analysis" });

  try {
    const parsed = JSON.parse(outputText) as JsonRecord;
    return json(200, parsed);
  } catch {
    return json(502, { error: "invalid_analysis" });
  }
});
