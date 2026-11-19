import type { PGlite } from "@electric-sql/pglite";
import type { Deps, Rpc } from "../../supabase/functions/_shared/radar/pipeline.ts";
import { addDaysISO, warsawDateOf } from "../../supabase/functions/_shared/radar/time.ts";

const SET_RETURNING = new Set(["radar_claim_urls", "radar_due_sources", "radar_due_listings", "radar_get_source", "radar_get_source_by_id", "radar_club_claim_candidates", "radar_due_clubs"]);

/** rpc nad PGlite, zwracające JSON jak PostgREST (znaczniki czasu jako ISO). */
export const pgRpc = (db: PGlite): Rpc => async (fn, args = {}) => {
  const keys = Object.keys(args);
  const params = keys.map((k) => { const v = args[k]; return v !== null && typeof v === "object" && !(Array.isArray(v) && v.every((x) => typeof x === "string")) ? JSON.stringify(v) : v; });
  const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
  if (SET_RETURNING.has(fn)) return (await db.query<{ j: unknown }>(`select to_jsonb(t) as j from ${call} t`, params)).rows.map((r) => r.j);
  return (await db.query<{ j: unknown }>(`select to_jsonb(${call}) as j`, params)).rows[0]!.j;
};

export interface Page { status?: number; body: string; type?: string; headers?: Record<string, string> }

/** Dzień lokalny przesunięty o n dni od dziś (testy nie zależą od stałej daty). */
export const day = (n: number): string => addDaysISO(warsawDateOf(Date.now()), n);
export const plDate = (iso: string): string => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const article = (title: string, body: string) =>
  `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${body}</p><p>${"Więcej informacji o klubie, historii i sponsorach znajdziesz w zakładkach. ".repeat(6)}</p></article></body></html>`;

/** Wirtualny internet: strony, robots, kanały; rejestruje żądania. */
export class Web {
  pages = new Map<string, Page>();
  log: string[] = [];
  brave: Array<{ url: string; title: string }> | null = null;
  braveStatus = 200;
  anthropic: (url: string) => unknown = () => ({ is_opportunity: false });
  anthropicStatus = 200;
  /** Ostatnia treść wiadomości faktycznie wysłana do zewnętrznego modelu (do sprawdzania minimalizacji danych). */
  anthropicSent: string[] = [];
  set(url: string, page: Page | string) { this.pages.set(url, typeof page === "string" ? { body: page } : page); }
  fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    this.log.push(url);
    if (url.startsWith("https://api.anthropic.com")) {
      if (this.anthropicStatus !== 200) return new Response("", { status: this.anthropicStatus });
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      this.anthropicSent.push(body.messages[0]!.content);
      const pageUrl = /Adres: (\S+)/.exec(body.messages[0]!.content)![1]!;
      return new Response(JSON.stringify({ content: [{ type: "tool_use", input: this.anthropic(pageUrl) }] }), { status: 200 });
    }
    if (url.startsWith("https://api.search.brave.com")) {
      if (this.braveStatus !== 200) return new Response("", { status: this.braveStatus });
      return new Response(JSON.stringify({ web: { results: (this.brave ?? []).map((r) => ({ ...r, description: "opis" })) } }), { status: 200, headers: { "x-ratelimit-remaining": "100" } });
    }
    const p = this.pages.get(url);
    if (!p) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(p.body, { status: p.status ?? 200, headers: { "content-type": p.type ?? "text/html; charset=utf-8", ...p.headers } });
  }) as typeof fetch;
  count(prefix: string) { return this.log.filter((u) => u.startsWith(prefix)).length; }
}

export const q = (value: string, evidence: string) => ({ value, evidence });

export function deps(web: Web, db: PGlite, over: Partial<Deps> = {}): Deps {
  let t = Date.now();
  return {
    rpc: pgRpc(db),
    fetchDeps: { fetch: web.fetch, userAgent: "BallwiseRadar/1.0", resolve: async () => ["93.184.216.34"] },
    extractor: { fetch: web.fetch, apiKey: "test", model: "test-model" },
    brave: { fetch: web.fetch, apiKey: "test" },
    nowMs: () => (t += 1),
    sleep: async () => {},
    deadlineMs: Date.now() + 600_000,
    ...over,
  };
}
