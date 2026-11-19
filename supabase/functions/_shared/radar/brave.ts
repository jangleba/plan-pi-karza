export interface BraveResult { url: string; title: string; description: string; age: string | null }
export interface BraveDeps { fetch: typeof fetch; apiKey: string }
export type BraveResponse =
  | { ok: true; results: BraveResult[]; remaining: number | null }
  | { ok: false; error: "unauthorized" | "rate_limited" | "quota" | "api_error" | "network"; status?: number; retryAfterSeconds?: number };

/**
 * Adapter Brave Web Search API (serwerowy; klucz BRAVE_SEARCH_API_KEY tylko w sekretach).
 * Zapytanie zawiera wyłącznie ogólne hasła – nigdy danych użytkowników. Wynik to KANDYDAT, nie dowód aktualności.
 */
export async function braveSearch(deps: BraveDeps, q: string, opts: { offset?: number; count?: number; freshness?: "pd" | "pw" | "pm" | "py" } = {}): Promise<BraveResponse> {
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", q.slice(0, 380));
  u.searchParams.set("country", "PL");
  u.searchParams.set("search_lang", "pl");
  u.searchParams.set("count", String(Math.min(20, opts.count ?? 20)));
  u.searchParams.set("offset", String(Math.min(9, Math.max(0, opts.offset ?? 0))));
  u.searchParams.set("safesearch", "moderate");
  if (opts.freshness) u.searchParams.set("freshness", opts.freshness);
  try {
    const res = await deps.fetch(u.toString(), { headers: { accept: "application/json", "x-subscription-token": deps.apiKey } });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "unauthorized", status: res.status };
    if (res.status === 429) {
      const remaining = Number(res.headers.get("x-ratelimit-remaining")?.split(",")[0] ?? NaN);
      return { ok: false, error: remaining === 0 ? "rate_limited" : "quota", status: 429, retryAfterSeconds: Number(res.headers.get("retry-after") ?? 0) || undefined };
    }
    if (!res.ok) return { ok: false, error: "api_error", status: res.status };
    const data = (await res.json()) as { web?: { results?: Array<{ url?: string; title?: string; description?: string; age?: string }> } };
    const remaining = Number(res.headers.get("x-ratelimit-remaining")?.split(",")[0] ?? NaN);
    const results = (data.web?.results ?? []).filter((r) => typeof r.url === "string").map((r) => ({
      url: r.url!, title: String(r.title ?? "").slice(0, 300), description: String(r.description ?? "").slice(0, 500), age: r.age ?? null,
    }));
    return { ok: true, results, remaining: Number.isFinite(remaining) ? remaining : null };
  } catch {
    return { ok: false, error: "network" };
  }
}
