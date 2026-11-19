import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { clubProcessStep, clubRefreshStep, clubSearchStep, researchClub } from "../../supabase/functions/_shared/radar/clubpipeline.ts";
import { runDiscover } from "../../supabase/functions/_shared/radar/jobs.ts";
import { ADMIN, U1, asRole, freshDb } from "./pg.ts";
import { Web, deps } from "./world.ts";

let db: PGlite;
let web: Web;
const long = "Historia klubu, sukcesy drużyn młodzieżowych i informacje dla rodziców zawodników. ".repeat(6);
const home = (name: string, city: string) => `<html><head><title>${name} | Oficjalna strona</title><meta property="og:site_name" content="${name}"></head><body><a href="/kontakt">Kontakt</a><a href="/nabor-2026">Nabór do akademii</a><p>${name} – klub z miejscowości ${city}. ${long}</p></body></html>`;
const contact = (extra: string) => `<html><body><h1>Kontakt</h1>${extra}<p>${long}</p></body></html>`;
const D = (over: Parameters<typeof deps>[2] = {}) => deps(web, db, { resolveMx: async (d) => d !== "bezmx.pl", ...over });

const site = (domain: string, city: string, emails: string, name = "KS Orły") => {
  web.set(`https://${domain}/robots.txt`, { body: "User-agent: *\nDisallow: /admin\n", type: "text/plain" });
  web.set(`https://${domain}/`, home(name, city));
  web.set(`https://${domain}/kontakt`, contact(emails));
  web.set(`https://${domain}/nabor-2026`, contact("<p>Nabór 2026 – szczegóły wkrótce.</p>"));
};
const clubs = async () => (await db.query<{ domain: string; status: string; city: string | null; recruitment_url: string | null; name: string }>("select domain, status, city, recruitment_url, name from radar_clubs order by domain")).rows;
const feed = async () => (await db.query<{ f: { clubs: Array<{ name: string; contacts: Array<{ email: string; evidenceUrl: string; evidenceQuote: string; kind: string }> }> } }>("select radar_clubs_feed() as f")).rows[0]!.f.clubs;

beforeEach(async () => {
  db = await freshDb();
  web = new Web();
  await db.exec(`insert into auth.users (id) values ('${U1}'), ('${ADMIN}'); insert into radar_admins (user_id) values ('${ADMIN}')`);
}, 60_000);

describe("research jednego klubu", () => {
  it("znajduje adresy organizacyjne z cytatem i adresem strony, pomija osobiste, zapisuje link do naboru; klub czeka na akceptację", async () => {
    site("orly-fc.pl", "Kraków", `<p>Biuro klubu: <a href="mailto:biuro@orly-fc.pl">biuro@orly-fc.pl</a></p><p>Nabór: nabor [at] orly-fc.pl</p><p>Trener Jan Kowalski: jan.kowalski@gmail.com</p>`);
    const r = await researchClub(D(), "orly-fc.pl", "Kraków", false, false);
    expect(r).toMatchObject({ kind: "club", status: "pending_review", created: true });
    expect(await clubs()).toEqual([{ domain: "orly-fc.pl", status: "pending_review", city: "Kraków", recruitment_url: "https://orly-fc.pl/nabor-2026", name: "KS Orły" }]);
    const k = (await db.query<{ email: string; kind: string; evidence_url: string; evidence_quote: string; mx_ok: boolean }>("select email, kind, evidence_url, evidence_quote, mx_ok from radar_club_contacts order by email")).rows;
    expect(k.map((x) => x.email)).toEqual(["biuro@orly-fc.pl", "nabor@orly-fc.pl"]); // osobisty adres nie został zapisany
    expect(k.every((x) => x.mx_ok && x.evidence_url === "https://orly-fc.pl/kontakt" && x.evidence_quote.length > 8)).toBe(true);
    expect(k.find((x) => x.email === "nabor@orly-fc.pl")!.kind).toBe("recruitment");
    expect(await feed()).toEqual([]); // dopóki administrator nie zaakceptuje, zawodnik nic nie widzi
  });

  it("po akceptacji administratora klub jest widoczny z adresem, dowodem i linkiem; brak działającego MX ukrywa adres", async () => {
    site("orly-fc.pl", "Kraków", `<p>Biuro: biuro@orly-fc.pl</p>`);
    await researchClub(D(), "orly-fc.pl", "Kraków", false, false);
    const id = (await db.query<{ id: string }>("select id from radar_clubs")).rows[0]!.id;
    await asRole(db, "authenticated", ADMIN, () => db.query("select radar_admin_set_club($1, 'publish', null)", [id]));
    const f = await feed();
    expect(f).toHaveLength(1);
    expect(f[0]!.contacts[0]).toMatchObject({ email: "biuro@orly-fc.pl", evidenceUrl: "https://orly-fc.pl/kontakt" });
    expect(f[0]!.contacts[0]!.evidenceQuote).toContain("Biuro: biuro@orly-fc.pl");
    await db.exec("update radar_club_contacts set mx_ok = false");
    expect(await feed()).toEqual([]);
  });

  it("adres nieweryfikowany pod kątem poczty (brak MX) nie powoduje publikacji, nawet przy automatycznej akceptacji", async () => {
    site("bezmx.pl", "Kraków", `<p>Biuro: biuro@bezmx.pl</p>`, "KS Bez Poczty");
    const r = await researchClub(D(), "bezmx.pl", "Kraków", false, true);
    expect(r).toMatchObject({ kind: "club", status: "pending_review" });
    expect(await feed()).toEqual([]);
  });

  it("automatyczna publikacja (po zmianie ustawienia) wymaga potwierdzonej miejscowości na stronie klubu", async () => {
    site("orly-fc.pl", "Kraków", `<p>Biuro: biuro@orly-fc.pl</p>`);
    expect(await researchClub(D(), "orly-fc.pl", "Kraków", false, true)).toMatchObject({ status: "published" });
    await db.exec("delete from radar_clubs");
    site("inny.pl", "Rzeszów", `<p>Biuro: biuro@inny.pl</p>`, "KS Inny");
    expect(await researchClub(D(), "inny.pl", "Kraków", false, true)).toMatchObject({ status: "pending_review" }); // strona nie wspomina o Krakowie
  });

  it("strony bez adresu, tylko z osobistymi adresami albo katalogi są pomijane", async () => {
    site("pusty.pl", "Kraków", `<p>Zadzwoń do nas.</p>`, "KS Pusty");
    expect(await researchClub(D(), "pusty.pl", "Kraków", false, false)).toEqual({ kind: "skipped", why: "no_email" });
    site("osobisty.pl", "Kraków", `<p>Trener: jan.kowalski@gmail.com</p>`, "KS Osobisty");
    expect(await researchClub(D(), "osobisty.pl", "Kraków", false, false)).toEqual({ kind: "skipped", why: "only_personal_emails" });
    site("katalog.pl", "Kraków", Array.from({ length: 7 }, (_, i) => `<p>klub${i}@klub${i}.pl</p>`).join(""), "Katalog");
    expect(await researchClub(D(), "katalog.pl", "Kraków", false, false)).toEqual({ kind: "skipped", why: "directory" });
    expect(await clubs()).toEqual([]);
  });

  it("robots.txt: blokada całości, ścieżka kontaktu zabroniona, błąd 5xx; CAPTCHA – nic nie zapisujemy", async () => {
    site("a.pl", "Kraków", `<p>Biuro: biuro@a.pl</p>`);
    web.set("https://a.pl/robots.txt", { body: "User-agent: *\nDisallow: /\n", type: "text/plain" });
    expect(await researchClub(D(), "a.pl", "Kraków", false, false)).toEqual({ kind: "failed", why: "robots_disallow" });
    site("b.pl", "Kraków", `<p>Biuro: biuro@b.pl</p>`);
    web.set("https://b.pl/robots.txt", { body: "User-agent: *\nDisallow: /kontakt\n", type: "text/plain" });
    expect(await researchClub(D(), "b.pl", "Kraków", false, false)).toEqual({ kind: "skipped", why: "no_email" }); // strony głównej bez adresu
    expect(web.count("https://b.pl/kontakt")).toBe(0);
    web.set("https://c.pl/robots.txt", { body: "", status: 503, type: "text/plain" });
    web.set("https://c.pl/", home("C", "Kraków"));
    expect(await researchClub(D(), "c.pl", "Kraków", false, false)).toEqual({ kind: "failed", why: "robots_blocked" });
    web.set("https://d.pl/robots.txt", { body: "", type: "text/plain" });
    web.set("https://d.pl/", `<html><body><div class="g-recaptcha"></div></body></html>`);
    expect(await researchClub(D(), "d.pl", "Kraków", false, false)).toEqual({ kind: "failed", why: "page_not_content" });
    expect(await clubs()).toEqual([]);
  });
});

describe("odkrywanie przez wyszukiwarkę i przetwarzanie kandydatów", () => {
  it("wyniki → kandydaci (bez portali i mediów społecznościowych), potem research; zapytania są ogólne", async () => {
    web.brave = [
      { url: "https://orly-fc.pl/", title: "KS Orły" }, { url: "https://www.facebook.com/orly", title: "FB" }, { url: "https://www.pzpn.pl/kluby", title: "PZPN" },
      { url: "https://pusty.pl/", title: "Pusty" },
    ];
    site("orly-fc.pl", "Warszawa", `<p>Biuro: biuro@orly-fc.pl</p>`);
    site("pusty.pl", "Warszawa", `<p>Zadzwoń.</p>`, "Pusty");
    await db.exec("update radar_settings set value = '2' where key = 'club_queries_per_run'");
    const stats: Record<string, number> = {};
    await clubSearchStep(D(), stats);
    expect(stats.club_search_queries).toBe(2);
    const cands = (await db.query<{ domain: string; city_hint: string }>("select domain, city_hint from radar_club_candidates order by domain")).rows;
    expect(cands.map((c) => c.domain)).toEqual(["orly-fc.pl", "pusty.pl"]);
    const queries = web.log.filter((u) => u.startsWith("https://api.search.brave.com")).map((u) => new URL(u).searchParams.get("q")!);
    expect(queries.every((x) => /(klub|akademia|szkółka) piłkarsk/.test(x) && !/Kowalski|2008/.test(x))).toBe(true);
    // research: miejscowość z zapytania jest sprawdzana na stronie klubu
    const hint = cands[0]!.city_hint;
    web.set("https://orly-fc.pl/", home("KS Orły", hint));
    await clubProcessStep(D(), stats);
    expect(stats.club_club).toBe(1);
    expect(stats.club_skipped).toBe(1);
    expect((await clubs()).map((c) => [c.domain, c.status])).toEqual([["orly-fc.pl", "pending_review"]]);
    expect((await db.query<{ domain: string; state: string }>("select domain, state from radar_club_candidates order by domain")).rows).toEqual([{ domain: "orly-fc.pl", state: "done" }, { domain: "pusty.pl", state: "skipped" }]);
  });

  it("zablokowana (wycofana) domena nie wraca, a budżet dzienny ogranicza zapytania", async () => {
    web.brave = [{ url: "https://zly-klub.pl/", title: "Zły" }];
    await db.exec("insert into radar_blocked_domains (domain, reason) values ('zly-klub.pl', 'prośba klubu')");
    await db.exec("update radar_settings set value = '3' where key = 'club_queries_per_run'; update radar_settings set value = '4' where key = 'club_daily_query_budget'");
    const s1: Record<string, number> = {}, s2: Record<string, number> = {}, s3: Record<string, number> = {};
    await clubSearchStep(D(), s1); await clubSearchStep(D(), s2); await clubSearchStep(D(), s3);
    expect([s1.club_search_queries, s2.club_search_queries, s3.club_search_queries ?? 0]).toEqual([3, 1, 0]);
    expect((await db.query("select 1 from radar_club_candidates")).rows).toHaveLength(0);
    const out = (await db.query<{ r: { status: string } }>("select radar_upsert_club($1::jsonb) as r", [JSON.stringify({ domain: "zly-klub.pl", name: "Zły", website: "https://zly-klub.pl/", publish: true, contacts: [] })])).rows[0]!.r;
    expect(out.status).toBe("blocked");
  });

  it("pełny przebieg discover wykonuje research klubów obok ofert", async () => {
    web.brave = [{ url: "https://orly-fc.pl/", title: "KS Orły" }];
    site("orly-fc.pl", "Warszawa", `<p>Biuro: biuro@orly-fc.pl</p>`);
    await db.exec("update radar_settings set value = '1' where key = 'club_queries_per_run'");
    const r = await runDiscover(D());
    expect(r.status).toBe("ok");
    expect(r.stats.club_candidates).toBe(1);
  });
});

describe("odświeżanie, wygasanie, wycofanie, uprawnienia", () => {
  async function approved() {
    site("orly-fc.pl", "Kraków", `<p>Biuro: biuro@orly-fc.pl</p><p>Nabór: nabor@orly-fc.pl</p>`);
    await researchClub(D(), "orly-fc.pl", "Kraków", false, false);
    const id = (await db.query<{ id: string }>("select id from radar_clubs")).rows[0]!.id;
    await asRole(db, "authenticated", ADMIN, () => db.query("select radar_admin_set_club($1, 'publish', null)", [id]));
    return id;
  }
  const expire = async () => { await db.exec("update radar_clubs set next_check_at = now() - interval '1 minute'"); };

  it("ponowne potwierdzenie odnawia znacznik; adres usunięty ze strony znika; klub bez adresów przestaje być pokazywany", async () => {
    const id = await approved();
    await db.exec("update radar_club_contacts set checked_at = now() - interval '30 days'");
    await expire();
    const stats: Record<string, number> = {};
    await clubRefreshStep(D(), stats);
    expect(stats.club_refresh_club).toBe(1);
    const fresh = (await db.query<{ n: number }>("select count(*)::int as n from radar_club_contacts where checked_at > now() - interval '1 day'")).rows[0]!.n;
    expect(fresh).toBe(2);
    // adres nabor@ usunięty ze strony → oznaczony jako brakujący
    web.set("https://orly-fc.pl/kontakt", contact("<p>Biuro: biuro@orly-fc.pl</p>"));
    await expire(); await clubRefreshStep(D(), {});
    expect((await db.query<{ email: string; status: string }>("select email, status from radar_club_contacts order by email")).rows).toEqual([{ email: "biuro@orly-fc.pl", status: "active" }, { email: "nabor@orly-fc.pl", status: "missing" }]);
    expect((await feed())[0]!.contacts.map((c) => c.email)).toEqual(["biuro@orly-fc.pl"]);
    // brak jakiegokolwiek adresu → klub znika przy wygaszaniu
    web.set("https://orly-fc.pl/kontakt", contact("<p>Zapraszamy.</p>"));
    await expire(); await clubRefreshStep(D(), {});
    await db.query("select radar_expire()");
    expect((await db.query<{ status: string }>("select status from radar_clubs where id = $1", [id])).rows[0]!.status).toBe("stale");
    expect(await feed()).toEqual([]);
  });

  it("adres niepotwierdzany od 45 dni znika z aplikacji, a po ponownym potwierdzeniu klub wraca", async () => {
    const id = await approved();
    await db.exec("update radar_club_contacts set checked_at = now() - interval '46 days'");
    expect(await feed()).toEqual([]);
    await db.query("select radar_expire()");
    expect((await db.query<{ status: string }>("select status from radar_clubs where id = $1", [id])).rows[0]!.status).toBe("stale");
    await expire();
    await clubRefreshStep(D(), {});
    expect((await db.query<{ status: string }>("select status from radar_clubs where id = $1", [id])).rows[0]!.status).toBe("published");
    expect(await feed()).toHaveLength(1);
  });

  it("trzy kolejne błędy pobrania wyłączają klub (stale), a odstęp sprawdzeń rośnie", async () => {
    const id = await approved();
    web.pages.delete("https://orly-fc.pl/");
    for (let i = 0; i < 3; i++) { await expire(); await clubRefreshStep(D(), {}); }
    const r = (await db.query<{ status: string; consecutive_failures: number }>("select status, consecutive_failures from radar_clubs where id = $1", [id])).rows[0]!;
    expect(r).toEqual({ status: "stale", consecutive_failures: 3 });
  });

  it("wycofanie klubu blokuje domenę; wycofany nie wraca przy kolejnym badaniu", async () => {
    const id = await approved();
    await asRole(db, "authenticated", ADMIN, () => db.query("select radar_admin_set_club($1, 'withdraw', 'prośba klubu')", [id]));
    expect(await feed()).toEqual([]);
    expect((await db.query<{ domain: string }>("select domain from radar_blocked_domains")).rows).toEqual([{ domain: "orly-fc.pl" }]);
    const r = await researchClub(D(), "orly-fc.pl", "Kraków", true, true);
    expect(r).toMatchObject({ kind: "club", status: "blocked" });
    expect((await db.query<{ status: string }>("select status from radar_clubs")).rows[0]!.status).toBe("withdrawn");
  });

  it("uprawnienia i RLS: tabele klubów zamknięte, odczyt tylko przez radar_clubs_feed, akcje administratora wymagają roli, zgłoszenia z limitem", async () => {
    const id = await approved();
    for (const t of ["radar_clubs", "radar_club_contacts", "radar_club_candidates", "radar_blocked_domains", "radar_club_reports"]) {
      expect((await asRole(db, "anon", null, () => db.query(`select 1 from ${t}`))).rows, `anon ${t}`).toHaveLength(0);
      expect((await asRole(db, "authenticated", U1, () => db.query(`select 1 from ${t}`))).rows, `user ${t}`).toHaveLength(0);
    }
    expect((await asRole(db, "anon", null, () => db.query<{ f: { clubs: unknown[] } }>("select radar_clubs_feed() as f"))).rows[0]!.f.clubs).toHaveLength(1);
    await expect(asRole(db, "authenticated", U1, () => db.query("select radar_admin_set_club($1, 'withdraw', 'x')", [id]))).rejects.toThrow(/brak uprawnień/);
    for (const fn of ["radar_upsert_club('{}'::jsonb)", "radar_club_candidate_upsert('x.pl','u','t','c','q')", "radar_club_claim_candidates(1, 1)", "radar_due_clubs(1)"]) {
      await expect(asRole(db, "anon", null, () => db.query(`select ${fn}`)), fn).rejects.toThrow(/permission denied/i);
    }
    const report = (reason: string) => asRole(db, "anon", null, async () => (await db.query<{ ok: boolean }>("select radar_report_club($1, $2) as ok", [id, reason])).rows[0]!.ok);
    expect(await report("Proszę usunąć mój adres")).toBe(true);
    expect(await report("x")).toBe(false);
    for (let i = 0; i < 4; i++) expect(await report(`zgłoszenie ${i}`)).toBe(true);
    expect(await report("zbyt wiele")).toBe(false);
  });

  it("w odpowiedzi publicznej nie ma danych wewnętrznych", async () => {
    await approved();
    const json = JSON.stringify((await db.query("select radar_clubs_feed() as f")).rows[0]);
    expect(json).not.toMatch(/review_note|withdrawn_reason|consecutive_failures|robots/);
  });
});
