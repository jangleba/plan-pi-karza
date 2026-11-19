import { braveSearch, type BraveDeps } from "./brave.ts";
import { canonicalUrl, domainOf, hashText, sessionGroupKey } from "./dedup.ts";
import { callExtractor, looksLikeOpportunity, normalizeExtraction, type ExtractorDeps, type ListingDraft } from "./extract.ts";
import { fetchSafe, type FetchDeps, type FetchResult } from "./fetcher.ts";
import { classifyPage, extractLinks, extractTitle, findNextPage, htmlToText, parseFeed, parseSitemap } from "./html.ts";
import { queriesForRun } from "./queries.ts";
import { robotsAllows, robotsCrawlDelay, robotsFromResponse } from "./robots.ts";
import { sameSite } from "./urlsafe.ts";
import { warsawStartOfDay, isISODate } from "./time.ts";

/** Wywołanie funkcji bazy (supabase.rpc w produkcji, PGlite w testach). Zwraca wynik funkcji (skalar, JSON albo tablicę wierszy). */
export type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<unknown>;

export interface Scope { fetch: boolean; publish_facts: boolean; images: boolean }
export interface SourceRow {
  id: string; domain: string; name: string | null; status: string; allowed_scope: Scope; entry_urls: string[];
  robots_txt: string | null; robots_checked_at: string | null; robots_block_all: boolean; check_interval_minutes: number; crawl_delay_seconds: number;
}
export interface UrlRow { id: string; source_id: string; url: string; via: string; tries: number }
export interface ListingRow { id: string; source_id: string; url: string; content_hash: string | null; status: string }

export interface Settings {
  discover_interval_hours: number; refresh_interval_hours: number; brave_queries_per_run: number; brave_daily_query_budget: number; brave_pages_per_query: number;
  max_new_urls_per_run: number; max_refreshes_per_run: number; ai_daily_extraction_budget: number; monitor_pages_per_source: number; job_lock_ttl_seconds: number;
}

export interface Deps {
  rpc: Rpc;
  fetchDeps: FetchDeps;
  extractor: ExtractorDeps | null;
  brave: BraveDeps | null;
  nowMs: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Wywoływane przy awarii zadania lub źródeł (webhook administratora); nie zawiera sekretów. */
  alert?: (message: string) => Promise<void>;
  /** Czas końca partii (ms epoch) – zadanie oddaje resztę następnemu uruchomieniu. */
  deadlineMs: number;
}

export interface Stats { [k: string]: number }
const bump = (s: Stats, k: string, n = 1) => { s[k] = (s[k] ?? 0) + n; };

const SOCIAL = /(^|\.)(facebook|fb|instagram|twitter|x|tiktok|linkedin|youtube|youtu)\.(com|be)$/i;
const NON_ARTICLE = /\/(login|logowanie|kontakt|contact|polityka|regulamin|cookies|tag|kategoria|category|autor|author|szukaj|search|wp-json|feed|galeria|gallery)(\/|$|\?)|\.(pdf|jpg|jpeg|png|gif|webp|zip|docx?|xlsx?|mp4)(\?|$)/i;
const ARTICLE_HINT = /(nab[oó]r|testy|trening|rekrut|otwart|zapraszam|selekcj|przesiew|rocznik|akademi)/i;

async function settings(deps: Deps): Promise<Settings> {
  return (await deps.rpc("radar_settings_get")) as Settings;
}

/* ---------- robots i odstępy ---------- */

const lastFetch = new Map<string, number>();

async function politeFetch(deps: Deps, source: SourceRow, url: string, robotsDelay: number | null, opts: Parameters<typeof fetchSafe>[2] = {}): Promise<FetchResult> {
  const host = domainOf(url);
  const gap = Math.max(source.crawl_delay_seconds, robotsDelay ?? 0, 0) * 1000;
  const wait = (lastFetch.get(host) ?? 0) + gap - deps.nowMs();
  if (wait > 0) await deps.sleep(Math.min(wait, 10_000));
  lastFetch.set(host, deps.nowMs());
  return fetchSafe(url, deps.fetchDeps, opts);
}

interface Robots { txt: string | null; blockAll: boolean; delay: number | null }

/** Robots.txt źródła z pamięcią podręczną 24 h. Nieosiągalny (5xx) = ostrożnie nie pobieramy. */
export async function ensureRobots(deps: Deps, source: SourceRow): Promise<Robots> {
  const fresh = source.robots_checked_at && deps.nowMs() - Date.parse(source.robots_checked_at) < 24 * 3_600_000;
  if (fresh) return { txt: source.robots_txt, blockAll: source.robots_block_all, delay: robotsCrawlDelay(source.robots_txt) };
  const r = await fetchSafe(`https://${source.domain}/robots.txt`, deps.fetchDeps, { types: /^text\//i, maxBytes: 300_000, accept: "text/plain,*/*;q=0.1" });
  let parsed: ReturnType<typeof robotsFromResponse>;
  if (r.ok) parsed = robotsFromResponse(r.status, r.body);
  else if (r.error === "http_error" && r.status) parsed = robotsFromResponse(r.status, null);
  else parsed = { txt: null, blockAll: true }; // błąd sieci/DNS/typu: nie zakładamy zgody
  await deps.rpc("radar_set_robots", { p_id: source.id, p_txt: parsed.txt, p_block_all: parsed.blockAll });
  source.robots_txt = parsed.txt; source.robots_block_all = parsed.blockAll; source.robots_checked_at = new Date(deps.nowMs()).toISOString();
  return { ...parsed, delay: robotsCrawlDelay(parsed.txt) };
}

const pathOf = (url: string): string => { const u = new URL(url); return u.pathname + u.search; };

/* ---------- budowa zapisu ---------- */

export function buildUpsertPayload(source: SourceRow, url: string, draft: ListingDraft, reviewReasons: string[], contentHash: string, nowMs: number) {
  const reasons = [...reviewReasons];
  if (!source.allowed_scope.publish_facts) reasons.push("źródło nie ma zgody na publikację faktów");
  const confirmed = draft.organizerUpdatedAt && isISODate(draft.organizerUpdatedAt) && warsawStartOfDay(draft.organizerUpdatedAt) <= nowMs
    ? new Date(warsawStartOfDay(draft.organizerUpdatedAt)).toISOString() : null;
  const canon = canonicalUrl(url);
  return {
    url: canon, urlHash: hashText(canon), sourceId: source.id, contentHash, publish: reasons.length === 0, reviewReasons: [...new Set(reasons)],
    organizerConfirmedAt: confirmed,
    listing: {
      kind: draft.kind, organizer: draft.organizer || source.name || source.domain, title: null, summary: draft.summary, city: draft.city, venue: draft.venue,
      lat: draft.lat, lon: draft.lon, positions: draft.positions, signupMode: draft.signupMode, signupStatus: draft.signupStatus, costState: draft.costState,
      costPln: draft.costPln, requirementsText: draft.requirementsText, eligibility: draft.eligibility, indefinite: draft.indefinite,
      signupClosesAt: draft.signupClosesAt, publishedAt: draft.publishedAt ? new Date(warsawStartOfDay(draft.publishedAt)).toISOString() : null,
    },
    sessions: draft.sessions.map((s) => ({
      date: s.date, startTime: s.startTime, startsAt: s.startsAt, city: s.city, venue: s.venue, lat: s.lat, lon: s.lon, eligibility: s.eligibility, evidence: s.evidence,
      fingerprint: sessionGroupKey({ organizer: draft.organizer, city: s.city ?? draft.city, date: s.date, eligibility: s.eligibility }),
    })),
    evidence: draft.evidence,
  };
}

/* ---------- odczyt jednej strony ---------- */

export type PageOutcome =
  | { kind: "listing"; id: string; status: string; changed: boolean }
  | { kind: "not_opportunity" } | { kind: "unchanged" } | { kind: "no_extractor" } | { kind: "budget" }
  | { kind: "invalid"; outcome: string; status?: number; retry: boolean };

async function readPage(deps: Deps, source: SourceRow, url: string, robots: Robots, listing: ListingRow | null): Promise<PageOutcome> {
  const checkBase = { p_listing: listing?.id ?? null, p_source: source.id, p_url: url };
  const record = (outcome: string, valid: boolean, http: number | null, hash: string | null) =>
    deps.rpc("radar_record_check", { ...checkBase, p_outcome: outcome, p_http: http, p_valid: valid, p_hash: hash, p_details: null });

  if (robots.blockAll || !robotsAllows(robots.txt, pathOf(url))) { await record("blocked_robots", false, null, null); return { kind: "invalid", outcome: "blocked_robots", retry: false }; }
  const res = await politeFetch(deps, source, url, robots.delay);
  if (!res.ok) {
    await record(res.error, false, res.status ?? null, null);
    const gone = res.status === 404 || res.status === 410;
    if (gone && listing) await deps.rpc("radar_set_listing_status", { p_id: listing.id, p_status: "expired", p_reason: `strona usunięta (HTTP ${res.status})` });
    return { kind: "invalid", outcome: res.error, status: res.status, retry: !gone && !["ssrf", "not_https", "bad_type", "private_host", "ip_literal", "credentials", "bad_port", "bad_url", "too_long", "redirect_offsite"].includes(res.error) };
  }
  const cls = classifyPage(res.body);
  if (cls !== "ok") { await record(cls, false, res.status, null); return { kind: "invalid", outcome: cls, status: res.status, retry: cls !== "empty" }; }

  const text = htmlToText(res.body);
  const contentHash = hashText(text.slice(0, 60_000));
  if (listing && listing.content_hash === contentHash) { await record("ok", true, res.status, contentHash); return { kind: "unchanged" }; }
  if (!listing && !looksLikeOpportunity(text)) { await record("ok", true, res.status, contentHash); return { kind: "not_opportunity" }; }

  if (!deps.extractor) { if (listing) await record("changed_unparsed", false, res.status, contentHash); return { kind: "no_extractor" }; }
  const s = await settings(deps);
  const granted = (await deps.rpc("radar_budget_take", { p_kind: "ai", p_n: 1, p_limit: s.ai_daily_extraction_budget })) as number;
  if (!granted) { if (listing) await record("changed_unparsed", false, res.status, contentHash); return { kind: "budget" }; }

  const ex = await callExtractor(deps.extractor, { url: res.finalUrl, title: extractTitle(res.body), text });
  if (!ex.ok) { await record(`extract_${ex.error}`, false, res.status, contentHash); return { kind: "invalid", outcome: `extract_${ex.error}`, retry: true }; }
  const norm = normalizeExtraction(ex.raw, text, deps.nowMs());
  if (!norm.draft) {
    await record("ok", true, res.status, contentHash);
    if (listing) await deps.rpc("radar_set_listing_status", { p_id: listing.id, p_status: "expired", p_reason: "strona nie jest już ogłoszeniem" });
    return { kind: "not_opportunity" };
  }
  const payload = buildUpsertPayload(source, listing?.url ?? res.finalUrl, norm.draft, norm.reviewReasons, contentHash, deps.nowMs());
  const out = (await deps.rpc("radar_upsert_listing", { p: payload })) as { id: string; status: string; changed: boolean };
  await deps.rpc("radar_record_check", { p_listing: out.id, p_source: source.id, p_url: url, p_outcome: "ok", p_http: res.status, p_valid: true, p_hash: contentHash, p_details: { issues: norm.issues.length } });
  return { kind: "listing", id: out.id, status: out.status, changed: out.changed };
}

/* ---------- monitorowanie zatwierdzonych źródeł ---------- */

function isFeedBody(body: string): "feed" | "sitemap" | "html" {
  const head = body.slice(0, 600).toLowerCase();
  if (/<(urlset|sitemapindex)\b/.test(head)) return "sitemap";
  if (/<(rss|feed)\b/.test(head) || (head.includes("<?xml") && /<(rss|feed)\b/.test(body.slice(0, 2000).toLowerCase()))) return "feed";
  return "html";
}

/** Wykrywa kolejne ogłoszenia: RSS/Atom, mapy witryn (także indeksy) i listy aktualności z paginacją. */
export async function monitorSource(deps: Deps, source: SourceRow, stats: Stats): Promise<void> {
  const s = await settings(deps);
  const robots = await ensureRobots(deps, source);
  if (robots.blockAll) { bump(stats, "robots_blocked"); await deps.rpc("radar_mark_source_checked", { p_id: source.id, p_ok: false, p_error: "robots.txt niedostępny lub blokuje" }); return; }
  const found = new Map<string, string>();
  let anyOk = false, lastError = "";
  const add = (url: string, title: string) => {
    try {
      const u = new URL(url);
      if (!sameSite(`https://${source.domain}/`, url) || NON_ARTICLE.test(u.pathname + u.search) || u.pathname === "/") return;
      if (!robotsAllows(robots.txt, u.pathname + u.search)) return;
      found.set(canonicalUrl(url), title);
    } catch { /* zły adres */ }
  };
  for (const entry of source.entry_urls) {
    if (deps.nowMs() > deps.deadlineMs) break;
    let page: string | null = entry;
    for (let n = 0; page && n < Math.max(1, s.monitor_pages_per_source); n++) {
      if (!robotsAllows(robots.txt, pathOf(page))) { lastError = "blocked_robots"; break; } // także adresy wejściowe podlegają robots.txt
      const res = await politeFetch(deps, source, page, robots.delay, { types: /^(text|application)\//i });
      if (!res.ok) { lastError = res.error; break; }
      anyOk = true;
      const kind = isFeedBody(res.body);
      if (kind === "feed") { for (const it of parseFeed(res.body, res.finalUrl)) add(it.url, it.title); page = null; }
      else if (kind === "sitemap") {
        const sm = parseSitemap(res.body);
        if (sm.kind === "index") {
          for (const child of sm.urls.sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? "")).slice(0, 3)) {
            if (!sameSite(`https://${source.domain}/`, child.url) || !robotsAllows(robots.txt, pathOf(child.url))) continue;
            const r2 = await politeFetch(deps, source, child.url, robots.delay, { types: /^(text|application)\//i });
            if (r2.ok) for (const u of parseSitemap(r2.body).urls.sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? "")).slice(0, 200)) { if (ARTICLE_HINT.test(u.url)) add(u.url, ""); }
          }
        } else for (const u of sm.urls.sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? "")).slice(0, 200)) { if (ARTICLE_HINT.test(u.url)) add(u.url, ""); }
        page = null;
      } else {
        for (const l of extractLinks(res.body, res.finalUrl)) if (ARTICLE_HINT.test(l.url) || ARTICLE_HINT.test(l.text)) add(l.url, l.text);
        page = findNextPage(res.body, res.finalUrl); // paginacja: kolejne strony listy
      }
    }
  }
  let enqueued = 0;
  const items = [...found.entries()].slice(0, s.max_new_urls_per_run * 3).map(([url, title]) => ({ url, hash: hashText(url), title, via: "monitor" }));
  if (items.length) enqueued = (await deps.rpc("radar_enqueue_urls", { p_source: source.id, p_urls: items })) as number;
  bump(stats, "discovered_urls", found.size); bump(stats, "enqueued", enqueued);
  await deps.rpc("radar_mark_source_checked", { p_id: source.id, p_ok: anyOk, p_error: anyOk ? null : lastError || "brak odpowiedzi" });
}

/* ---------- wyszukiwanie (Brave) ---------- */

/** Wyniki to KANDYDACI: adres z zatwierdzonej domeny trafia do kolejki (strona i termin zostaną zweryfikowane na stronie organizatora),
 *  nowa domena – do rejestru źródeł do oceny. Fragment wyniku nigdy nie jest podstawą publikacji. */
export async function searchStep(deps: Deps, stats: Stats): Promise<void> {
  if (!deps.brave) { bump(stats, "search_skipped_no_key"); return; }
  const s = await settings(deps);
  const planned = queriesForRun(new Date(deps.nowMs()), s.brave_queries_per_run);
  const pages = Math.max(1, s.brave_pages_per_query);
  const granted = (await deps.rpc("radar_budget_take", { p_kind: "brave", p_n: planned.length * pages, p_limit: s.brave_daily_query_budget })) as number;
  const queries = planned.slice(0, Math.floor(granted / pages));
  if (!queries.length) { bump(stats, "search_budget_exhausted"); return; }
  const approved = new Map<string, SourceRow | null>();
  for (const q of queries) {
    for (let page = 0; page < pages; page++) {
      if (deps.nowMs() > deps.deadlineMs) return;
      const r = await braveSearch(deps.brave, q.q, { offset: page, freshness: "pm" });
      bump(stats, "search_queries");
      if (!r.ok) {
        bump(stats, `search_${r.error}`);
        if (r.error === "unauthorized" || r.error === "quota" || r.error === "rate_limited") return; // nie męczymy API
        continue;
      }
      for (const res of r.results) {
        let domain: string;
        try { domain = domainOf(res.url); } catch { continue; }
        if (SOCIAL.test(domain)) { bump(stats, "search_social_skipped"); continue; } // brak nieautoryzowanego pobierania z mediów społecznościowych
        if (!approved.has(domain)) {
          const rows = (await deps.rpc("radar_get_source", { p_domain: domain })) as SourceRow[];
          approved.set(domain, rows[0] ?? null);
        }
        const src = approved.get(domain)!;
        if (src && src.status === "approved") {
          const n = (await deps.rpc("radar_enqueue_urls", { p_source: src.id, p_urls: [{ url: canonicalUrl(res.url), hash: hashText(canonicalUrl(res.url)), title: res.title, via: "search", query: q.q }] })) as number;
          bump(stats, "search_enqueued", n);
        } else if (!src || src.status === "candidate") {
          await deps.rpc("radar_upsert_candidate_source", { p_domain: domain, p_sample_url: res.url, p_title: res.title, p_query: q.q, p_via: "search" });
          bump(stats, "search_candidates");
        }
      }
    }
  }
}

/* ---------- przetwarzanie kolejki ---------- */

export async function processQueue(deps: Deps, stats: Stats, limit: number): Promise<void> {
  const rows = (await deps.rpc("radar_claim_urls", { p_limit: limit, p_ttl_seconds: 900 })) as UrlRow[];
  const sources = new Map<string, SourceRow>();
  for (const row of rows) {
    if (deps.nowMs() > deps.deadlineMs) { await deps.rpc("radar_complete_url", { p_id: row.id, p_state: "pending", p_error: "limit czasu partii" }); continue; }
    try {
      if (!sources.has(row.source_id)) sources.set(row.source_id, ((await deps.rpc("radar_get_source_by_id", { p_id: row.source_id })) as SourceRow[])[0]!);
      const source = sources.get(row.source_id)!;
      const robots = await ensureRobots(deps, source);
      const r = await readPage(deps, source, row.url, robots, null);
      bump(stats, `url_${r.kind}`);
      if (r.kind === "listing") bump(stats, `listing_${r.status}`);
      const state = r.kind === "invalid" ? (r.retry && row.tries < 5 ? "pending" : "failed") : r.kind === "no_extractor" ? "review" : r.kind === "budget" ? "pending" : r.kind === "not_opportunity" ? "skipped" : "done";
      await deps.rpc("radar_complete_url", { p_id: row.id, p_state: state, p_error: r.kind === "invalid" ? r.outcome : null });
    } catch (e) {
      bump(stats, "url_errors");
      await deps.rpc("radar_complete_url", { p_id: row.id, p_state: row.tries < 5 ? "pending" : "failed", p_error: e instanceof Error ? e.message.slice(0, 200) : "błąd" });
    }
  }
}

/* ---------- odświeżanie opublikowanych ---------- */

export async function refreshStep(deps: Deps, stats: Stats): Promise<void> {
  const s = await settings(deps);
  const rows = (await deps.rpc("radar_due_listings", { p_limit: s.max_refreshes_per_run })) as ListingRow[];
  const sources = new Map<string, SourceRow>();
  const outcomes = new Map<string, boolean>();
  for (const l of rows) {
    if (deps.nowMs() > deps.deadlineMs) { bump(stats, "refresh_deferred"); continue; }
    try {
      if (!sources.has(l.source_id)) sources.set(l.source_id, ((await deps.rpc("radar_get_source_by_id", { p_id: l.source_id })) as SourceRow[])[0]!);
      const source = sources.get(l.source_id)!;
      const r = await readPage(deps, source, l.url, await ensureRobots(deps, source), l);
      bump(stats, `refresh_${r.kind}`);
      outcomes.set(l.source_id, (outcomes.get(l.source_id) ?? false) || r.kind !== "invalid");
    } catch {
      bump(stats, "refresh_errors");
    }
  }
  for (const [id, ok] of outcomes) await deps.rpc("radar_mark_source_checked", { p_id: id, p_ok: ok, p_error: ok ? null : "odświeżanie ogłoszeń nie powiodło się" });
}
