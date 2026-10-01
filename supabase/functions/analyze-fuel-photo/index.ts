import { createClient } from "npm:@supabase/supabase-js@2.112.3";

type JsonRecord = Record<string, unknown>;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_SESSION_KINDS = new Set([
  "match",
  "strength",
  "speed",
  "endurance",
  "football",
  "recovery",
  "none",
]);
const ALLOWED_INTENSITIES = new Set(["niska", "umiarkowana", "wysoka"]);

function allowedOrigins(): Set<string> {
  return new Set(
    (Deno.env.get("FUEL_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function responseHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request: Request, status: number, body: JsonRecord) {
  return Response.json(body, {
    status,
    headers: responseHeaders(request),
  });
}

function safeSession(raw: unknown): JsonRecord {
  if (!raw || typeof raw !== "object") return {};
  const candidate = raw as JsonRecord;
  const kind = typeof candidate.kind === "string" && ALLOWED_SESSION_KINDS.has(candidate.kind)
    ? candidate.kind
    : "none";
  const intensity =
    typeof candidate.intensity === "string" && ALLOWED_INTENSITIES.has(candidate.intensity)
      ? candidate.intensity
      : null;
  const duration = typeof candidate.durationMin === "number" ? candidate.durationMin : null;
  return {
    kind,
    intensity,
    durationMin:
      duration == null || !Number.isFinite(duration)
        ? null
        : Math.max(0, Math.min(300, Math.round(duration))),
  };
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
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins().has(origin)) {
    return json(request, 403, { error: "origin_not_allowed" });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(request) });
  }
  if (request.method !== "POST") return json(request, 405, { error: "method_not_allowed" });
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
    return json(request, 415, { error: "content_type_not_supported" });
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json(request, 413, { error: "request_too_large" });
  }

  const authHeader = request.headers.get("Authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(authHeader)) {
    return json(request, 401, { error: "missing_authorization" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(request, 503, { error: "backend_not_configured" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) {
    return json(request, 401, { error: "invalid_authorization" });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: quotaData, error: quotaError } = await serviceClient
    .rpc("consume_fuel_photo_quota", { p_user_id: authData.user.id })
    .maybeSingle();
  if (quotaError || !quotaData) {
    console.error("Fuel photo quota check failed", { code: quotaError?.code ?? "missing_result" });
    return json(request, 503, { error: "quota_check_unavailable" });
  }
  if (quotaData.allowed !== true) {
    return json(request, 429, {
      error: "rate_limit_exceeded",
      message: "Wykorzystano limit skanów. Spróbuj ponownie za kilka minut.",
      retryAfterSeconds: quotaData.retry_after_seconds,
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json(request, 503, { error: "ai_not_configured" });

  let body: JsonRecord;
  try {
    body = (await request.json()) as JsonRecord;
  } catch {
    return json(request, 400, { error: "invalid_json" });
  }

  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/i);
  const mime = match?.[1]?.toLowerCase();
  if (!mime || !ALLOWED_MIME.has(mime)) {
    return json(request, 400, { error: "unsupported_image", message: "Użyj zdjęcia JPG, PNG lub WebP." });
  }
  if (imageBytes(imageDataUrl) > MAX_IMAGE_BYTES) {
    return json(request, 413, { error: "image_too_large", message: "Zdjęcie po przygotowaniu jest za duże." });
  }

  const session = safeSession(body.session);
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
    return json(request, 502, {
      error: "analysis_provider_error",
      message: "Analiza zdjęcia jest chwilowo niedostępna. Opisz posiłek jednym zdaniem.",
    });
  }

  const payload = (await apiResponse.json()) as JsonRecord;
  const outputText = extractOutputText(payload);
  if (!outputText) return json(request, 502, { error: "empty_analysis" });

  try {
    const parsed = JSON.parse(outputText) as JsonRecord;
    return json(request, 200, parsed);
  } catch {
    return json(request, 502, { error: "invalid_analysis" });
  }
});
