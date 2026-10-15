import { TECHNIQUE_HINTS } from "../_shared/trainingCoachKnowledge.ts";

export const TOPICS = ["intent", "technique", "tempo", "rest", "dose", "load", "equipment", "trainer", "unknown"] as const;
export type CoachTopic = typeof TOPICS[number];
export interface CoachActor { userId: string; age: number | null; guardianReady: boolean }
export interface CoachDependencies {
  origins: Set<string>;
  enabled: boolean;
  authenticate: (request: Request) => Promise<CoachActor | null>;
  quota: (userId: string) => Promise<"ok" | "limit" | "unavailable">;
  classify: (question: string, signal: AbortSignal) => Promise<CoachTopic>;
}

function clean(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max && value.trim()
    ? value.trim() : null;
}

async function body(request: Request) {
  if (!request.body) throw new Error("bad_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.length;
      if (size > 8192) { await reader.cancel(); throw new Error("too_large"); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(all));
}

export function createCoachHandler(deps: CoachDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const headers: Record<string, string> = {
      "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (origin && deps.origins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
    const json = (status: number, value: object) => Response.json(value, { status, headers });
    if (origin && !deps.origins.has(origin)) return json(403, { error: "origin_not_allowed" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (!/^Bearer\s+\S+$/i.test(request.headers.get("Authorization") ?? ""))
      return json(401, { error: "authentication_required" });
    let actor: CoachActor | null;
    try { actor = await deps.authenticate(request); } catch { actor = null; }
    if (!actor) return json(401, { error: "authentication_required" });
    if (actor.age == null || actor.age < 13 || actor.age < 16 && !actor.guardianReady)
      return json(403, { error: "account_not_ready" });
    let raw: Record<string, unknown>;
    try { raw = await body(request); }
    catch (error) { return json(error instanceof Error && error.message === "too_large" ? 413 : 400, { error: "invalid_body" }); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json(400, { error: "invalid_body" });
    const question = clean(raw.question, 600);
    const exercise = raw.exercise && typeof raw.exercise === "object" && !Array.isArray(raw.exercise)
      ? raw.exercise as Record<string, unknown> : {};
    const key = clean(exercise.guideKey, 40);
    if (!question || !key || !Object.hasOwn(TECHNIQUE_HINTS, key))
      return json(422, { error: "unsupported_question_or_exercise" });
    const normalized = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
    if (/boli|bol |bolu|bole|uraz|kontuz|dretw|omdlen|zawrot|bezpiecz|czy moge/.test(normalized))
      return json(200, { answer: "Rozmowa nie potwierdza gotowości do ćwiczenia. Przy objawie przerwij ćwiczenie i omów go z lekarzem lub fizjoterapeutą; dobór nowego, trudnego wariantu sprawdź z trenerem.", needsTrainer: true });
    if (!deps.enabled) return json(503, { error: "coach_not_configured" });
    let quota: Awaited<ReturnType<CoachDependencies["quota"]>>;
    try { quota = await deps.quota(actor.userId); } catch { quota = "unavailable"; }
    if (quota !== "ok") return json(quota === "limit" ? 429 : 503, { error: quota === "limit" ? "limit_reached" : "quota_unavailable" });
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) controller.abort();
    const timeout = setTimeout(abort, 12_000);
    let topic: CoachTopic;
    try { topic = await deps.classify(question, controller.signal); }
    catch { return json(503, { error: "coach_unavailable" }); }
    finally { clearTimeout(timeout); request.signal.removeEventListener("abort", abort); }
    if (!TOPICS.includes(topic)) return json(503, { error: "invalid_provider_result" });
    const hint = TECHNIQUE_HINTS[key];
    // AI selects a reviewed topic. It cannot invent a load, diagnosis or safety verdict.
    const answers: Record<CoachTopic, string> = {
      intent: hint.intent,
      technique: `${hint.action} Unikaj: ${hint.avoid}`,
      tempo: clean(exercise.tempo, 60) ? `Tempo zapisane w sesji: ${clean(exercise.tempo, 60)}. ${hint.action}`
        : `${hint.action} W tej sesji nie zapisano dokładnego tempa w sekundach.`,
      rest: clean(exercise.rest, 60) ? `Przerwa zapisana przy ćwiczeniu lub parze: ${clean(exercise.rest, 60)}.`
        : "Sprawdź przerwę przy całym bloku lub parze. W danych ćwiczenia nie ma osobnej przerwy.",
      dose: `Dawka w sesji: ${[clean(exercise.sets, 40) && `${clean(exercise.sets, 40)} serie`, clean(exercise.reps, 60) && `${clean(exercise.reps, 60)} powtórzeń`].filter(Boolean).join(" · ") || "sprawdź blok sesji"}. Nie zwiększaj jej kosztem techniki.`,
      load: actor.age < 18 ? "Dobierz opór z trenerem do doświadczenia i kontroli tego ruchu. Rozmowa ani sam zapis serii nie uprawniają do zwiększenia ciężaru."
        : "Kieruj się zaleceniem ciężaru i zapasu z sesji. Nie wyznaczę odpowiedniego ciężaru na podstawie samego pytania; najpierw potwierdź kontrolę ruchu.",
      equipment: "Wybierz zmianę sprzętu przy ćwiczeniu. Zamiennik powinien zachować cel i mieć własną dawkę; ciężaru nie przenosimy automatycznie.",
      trainer: "Pierwszą próbę wymagającego wariantu sprawdź z trenerem. Asystent nie potwierdza techniki ani nie odblokowuje ćwiczeń wymagających nadzoru.",
      unknown: "Doprecyzuj, czy pytasz o ustawienie, tempo, dawkę czy przerwę. Jeżeli instrukcja nie rozstrzyga problemu, sprawdź wykonanie z trenerem.",
    };
    return json(200, { answer: answers[topic], needsTrainer: topic === "trainer" || topic === "load" && actor.age < 18 });
  };
}
