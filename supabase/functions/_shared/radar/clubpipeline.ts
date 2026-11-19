import { braveSearch } from "./brave.ts";
import { classifyPage, htmlToText } from "./html.ts";
import { fetchSafe, type FetchResult } from "./fetcher.ts";
import { clubName, cityInText, clubDomainSkipped, extractEmails, findContactLinks, findRecruitmentLink, looksLikeDirectory } from "./clubs.ts";
import { lookupPlace } from "./geo.ts";
import { PL_PLACES } from "./places.ts";
import type { Deps, Stats } from "./pipeline.ts";
import { clubQueriesFor } from "./queries.ts";
import { robotsAllows, robotsCrawlDelay, robotsFromResponse } from "./robots.ts";
import { domainOf } from "./dedup.ts";

/**
 * Research klubów: wyszukiwanie ogólne (miejscowość + hasło „klub/akademia … kontakt”) → kandydaci (domeny) → pobranie strony głównej
 * i maks. 3 podstron kontaktowych klubu (robots.txt, grzeczne odstępy) → tylko adresy organizacyjne z cytatem i działającym MX →
 * klub do akceptacji administratora (albo publikacja automatyczna po zmianie ustawienia).
 */

interface Cand { id: string; domain: string; city_hint: string | null }
interface ClubRow { id: string; domain: string; website: string; status: string }
interface ClubSettings { club_auto_publish: boolean; club_queries_per_run: number; club_daily_query_budget: number; club_candidates_per_run: number; club_recheck_days: number }

const bump = (s: Stats, k: string, n = 1) => { s[k] = (s[k] ?? 0) + n; };
const settings = async (d: Deps) => (await d.rpc("radar_settings_get")) as ClubSettings;

const lastFetch = new Map<string, number>();
async function polite(d: Deps, url: string, delaySec: number): Promise<FetchResult> {
  const host = domainOf(url);
  const wait = (lastFetch.get(host) ?? 0) + Math.max(delaySec, 1) * 1000 - d.nowMs();
  if (wait > 0) await d.sleep(Math.min(wait, 10_000));
  lastFetch.set(host, d.nowMs());
  return fetchSafe(url, d.fetchDeps);
}

async function robotsFor(d: Deps, domain: string): Promise<{ txt: string | null; blockAll: boolean }> {
  const r = await fetchSafe(`https://${domain}/robots.txt`, d.fetchDeps, { types: /^text\//i, maxBytes: 300_000, accept: "text/plain,*/*;q=0.1" });
  if (r.ok) return robotsFromResponse(r.status, r.body);
  if (r.error === "http_error" && r.status) return robotsFromResponse(r.status, null);
  return { txt: null, blockAll: true };
}

export type ClubOutcome = { kind: "club"; status: string; created: boolean } | { kind: "skipped"; why: string } | { kind: "failed"; why: string };

/** Bada jedną domenę klubu. `approved` = klub już zaakceptowany wcześniej (odświeżenie): zostaje opublikowany po ponownym potwierdzeniu. */
export async function researchClub(d: Deps, domain: string, cityHint: string | null, approved: boolean, autoPublish: boolean): Promise<ClubOutcome> {
  const robots = await robotsFor(d, domain);
  if (robots.blockAll) return { kind: "failed", why: "robots_blocked" };
  const delay = robotsCrawlDelay(robots.txt) ?? 1;
  const home = `https://${domain}/`;
  if (!robotsAllows(robots.txt, "/")) return { kind: "failed", why: "robots_disallow" };
  const h = await polite(d, home, delay);
  if (!h.ok) return { kind: "failed", why: h.error };
  if (classifyPage(h.body) !== "ok") return { kind: "failed", why: "page_not_content" };

  const pages: Array<{ url: string; html: string }> = [{ url: h.finalUrl, html: h.body }];
  for (const link of findContactLinks(h.body, h.finalUrl)) {
    if (!robotsAllows(robots.txt, new URL(link).pathname + new URL(link).search)) continue;
    const r = await polite(d, link, delay);
    if (r.ok && classifyPage(r.body) === "ok") pages.push({ url: r.finalUrl, html: r.body });
  }

  const contacts = new Map<string, { email: string; kind: "general" | "recruitment"; evidenceQuote: string; evidenceUrl: string; mxOk: boolean }>();
  let personalSkipped = 0;
  for (const p of pages) {
    const emails = extractEmails(p.html);
    if (looksLikeDirectory(emails)) return { kind: "skipped", why: "directory" };
    for (const e of emails) {
      if (!e.organizational) { personalSkipped++; continue; }
      if (contacts.has(e.email)) continue;
      const mxOk = d.resolveMx ? await d.resolveMx(e.email.split("@")[1]!).catch(() => false) : false;
      contacts.set(e.email, { email: e.email, kind: e.recruitment ? "recruitment" : "general", evidenceQuote: e.quote, evidenceUrl: p.url, mxOk });
    }
  }
  if (!contacts.size) {
    // zaakceptowany klub, na którego stronie nie ma już żadnego adresu organizacyjnego: adresy oznaczamy jako brakujące (klub zniknie przy wygaszaniu)
    if (approved) await d.rpc("radar_upsert_club", { p: { domain, name: clubName(h.body, domain), website: h.finalUrl, recruitmentUrl: null, publish: true, complete: true, contacts: [] } });
    return { kind: "skipped", why: personalSkipped ? "only_personal_emails" : "no_email" };
  }

  const fullText = pages.map((p) => htmlToText(p.html)).join("\n");
  const place = cityHint && cityInText(fullText, cityHint) ? lookupPlace(cityHint) : null;
  const recruitment = pages.map((p) => findRecruitmentLink(p.html, p.url)).find(Boolean) ?? null;
  const usable = [...contacts.values()].filter((c) => c.mxOk);
  const publish = (approved || autoPublish) && usable.length > 0 && (approved || !!place);
  const out = (await d.rpc("radar_upsert_club", {
    p: { domain, name: clubName(h.body, domain), city: place?.name ?? null, lat: place?.lat ?? null, lon: place?.lon ?? null, website: h.finalUrl, recruitmentUrl: recruitment, publish, complete: true, contacts: [...contacts.values()] },
  })) as { id: string | null; status: string; created: boolean };
  return { kind: "club", status: out.status, created: out.created };
}

/** Wyszukiwanie ogólne: kandydaci na kluby (domeny). Fragment wyniku nigdy nie jest źródłem adresu – adres czytamy ze strony klubu. */
export async function clubSearchStep(d: Deps, stats: Stats): Promise<void> {
  if (!d.brave) { bump(stats, "club_search_skipped_no_key"); return; }
  const s = await settings(d);
  const cities = PL_PLACES.slice(0, 150).map((p) => p[0]);
  const planned = clubQueriesFor(cities, new Date(d.nowMs()), s.club_queries_per_run);
  const granted = (await d.rpc("radar_budget_take", { p_kind: "brave_clubs", p_n: planned.length, p_limit: s.club_daily_query_budget })) as number;
  for (const q of planned.slice(0, granted)) {
    if (d.nowMs() > d.deadlineMs) return;
    const r = await braveSearch(d.brave, q.q, { offset: 0, freshness: undefined });
    bump(stats, "club_search_queries");
    if (!r.ok) { bump(stats, `club_search_${r.error}`); if (r.error !== "api_error" && r.error !== "network") return; continue; }
    for (const res of r.results) {
      let domain: string;
      try { domain = domainOf(res.url); } catch { continue; }
      if (clubDomainSkipped(domain)) continue;
      const id = await d.rpc("radar_club_candidate_upsert", { p_domain: domain, p_url: res.url, p_title: res.title, p_city: q.city, p_query: q.q });
      if (id) bump(stats, "club_candidates");
    }
  }
}

/** Przetwarza porcję kandydatów. */
export async function clubProcessStep(d: Deps, stats: Stats): Promise<void> {
  const s = await settings(d);
  const rows = (await d.rpc("radar_club_claim_candidates", { p_limit: s.club_candidates_per_run, p_ttl_seconds: 900 })) as Cand[];
  for (const c of rows) {
    if (d.nowMs() > d.deadlineMs) { await d.rpc("radar_club_candidate_done", { p_id: c.id, p_state: "pending", p_error: "limit czasu partii" }); continue; }
    try {
      const r = await researchClub(d, c.domain, c.city_hint, false, !!s.club_auto_publish);
      bump(stats, `club_${r.kind}`);
      if (r.kind === "club") bump(stats, `club_${r.status}`);
      await d.rpc("radar_club_candidate_done", { p_id: c.id, p_state: r.kind === "club" ? "done" : r.kind === "skipped" ? "skipped" : "failed", p_error: r.kind === "club" ? null : r.why });
    } catch (e) {
      bump(stats, "club_errors");
      await d.rpc("radar_club_candidate_done", { p_id: c.id, p_state: "failed", p_error: e instanceof Error ? e.message.slice(0, 200) : "błąd" });
    }
  }
}

/** Ponowne potwierdzanie adresów zaakceptowanych klubów (co `club_recheck_days` dni). Brak potwierdzenia = klub znika po 45 dniach. */
export async function clubRefreshStep(d: Deps, stats: Stats): Promise<void> {
  const s = await settings(d);
  const rows = (await d.rpc("radar_due_clubs", { p_limit: s.club_candidates_per_run })) as ClubRow[];
  for (const c of rows) {
    if (d.nowMs() > d.deadlineMs) { bump(stats, "club_refresh_deferred"); continue; }
    try {
      const r = await researchClub(d, c.domain, null, true, true);
      bump(stats, `club_refresh_${r.kind}`);
      await d.rpc("radar_club_mark", { p_id: c.id, p_ok: r.kind === "club" || (r.kind === "skipped" && r.why !== "directory"), p_error: r.kind === "club" ? null : r.why, p_days: s.club_recheck_days });
    } catch (e) {
      bump(stats, "club_refresh_errors");
      await d.rpc("radar_club_mark", { p_id: c.id, p_ok: false, p_error: e instanceof Error ? e.message.slice(0, 200) : "błąd", p_days: s.club_recheck_days });
    }
  }
}
