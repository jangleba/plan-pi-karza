import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { runDiscover, runRefresh } from "../../supabase/functions/_shared/radar/jobs.ts";
import { ADMIN, freshDb } from "./pg.ts";
import { Web, article, day, deps, pgRpc, plDate, q } from "./world.ts";

let db: PGlite;
let web: Web;
let src: string;

const D1 = () => day(5), D2 = () => day(6);

/** Treść ogłoszenia z dwiema sesjami i odpowiadające jej poprawne wyjście modelu (cytaty wzięte z tej treści). */
function announcement(title: string, o: { closed?: boolean; firstDate?: string; update?: string; confirm?: string } = {}) {
  const d1 = o.firstDate ?? D1(), d2 = D2();
  const lines = {
    org: "Akademia Piłkarska Orły Kraków zaprasza na otwarte testy piłkarskie",
    s1: `${plDate(d1)}, godz. 17:00 – roczniki 2012–2013`,
    s2: `${plDate(d2)}, godz. 17:00 – rocznik 2014`,
    place: "Miejsce: Hala Orłów, Kraków, ul. Sportowa 1",
    cost: "Testy są bezpłatne",
    signup: o.closed ? "Zapisy zostały zamknięte" : "Zgłoszenia indywidualne przyjmujemy do końca tygodnia",
    pos: "Zapraszamy zawodników z pola i bramkarzy",
    upd: o.update ? `Aktualizacja ogłoszenia: ${plDate(o.update)}` : "",
    conf: o.confirm ? `Informacja aktualna na dzień ${plDate(o.confirm)}, potwierdzamy, że nabór nadal trwa` : "",
  };
  const html = article(title, `${lines.org}! ${lines.s1}. ${lines.s2}. ${lines.place}. ${lines.cost}. ${lines.signup}. ${lines.pos}. Rocznik, wiek i testy – szczegóły. ${lines.upd} ${lines.conf}`);
  const extraction = {
    is_opportunity: true, kind: "testy", organizer: q("Akademia Piłkarska Orły Kraków", lines.org), city: q("Kraków", "Hala Orłów, Kraków"), venue: q("Hala Orłów", "Miejsce: Hala Orłów"),
    summary: "Otwarte testy w Krakowie dla kilku roczników, w dwóch terminach.",
    signup_status: q(o.closed ? "closed" : "open", o.closed ? lines.signup : "Zgłoszenia indywidualne przyjmujemy do końca tygodnia"),
    signup_mode: q("individual", "Zgłoszenia indywidualne przyjmujemy"),
    cost: { state: "free", evidence: lines.cost }, positions: { scope: "all", evidence: lines.pos },
    ...(o.update ? { page_updated_at: q(o.update, `Aktualizacja ogłoszenia: ${plDate(o.update)}`) } : {}),
    ...(o.confirm ? { organizer_confirmation: q(o.confirm, `Informacja aktualna na dzień ${plDate(o.confirm)}, potwierdzamy, że nabór nadal trwa`) } : {}),
    sessions: [
      { date: d1, start_time: "17:00", evidence: lines.s1, eligibility: { birth_years: [{ op: "range", from: 2012, to: 2013 }], evidence: "roczniki 2012–2013" } },
      { date: d2, start_time: "17:00", evidence: lines.s2, eligibility: { birth_years: [{ op: "in", years: [2014] }], evidence: "rocznik 2014" } },
    ],
  };
  return { html, extraction };
}

const feed = (...urls: string[]) => `<?xml version="1.0"?><rss><channel>${urls.map((u, i) => `<item><title>Wpis ${i}</title><link>${u}</link></item>`).join("")}</channel></rss>`;

async function listings() {
  return (await db.query<{ url: string; status: string; kind: string }>("select url, status, kind from radar_listings order by url")).rows;
}

beforeEach(async () => {
  db = await freshDb();
  web = new Web();
  await db.exec(`insert into auth.users (id) values ('${ADMIN}'); update radar_settings set value = '0' where key = 'club_queries_per_run'`); // research klubów testowany osobno (clubdb.test.ts)
  src = (await db.query<{ id: string }>(
    `insert into radar_sources (domain, name, status, license_basis, allowed_scope, entry_urls, crawl_delay_seconds)
     values ('orly-fc.pl', 'Orły', 'approved', 'Umowa z organizatorem z 2026-11-01 – fakty z ogłoszeń', '{"fetch": true, "publish_facts": true, "images": false}', '{https://orly-fc.pl/feed.xml}', 0) returning id`)).rows[0]!.id;
  web.set("https://orly-fc.pl/robots.txt", { body: "User-agent: *\nDisallow: /prywatne\n", type: "text/plain" });
}, 60_000);

describe("discover: monitorowanie źródła → nowe ogłoszenia", () => {
  it("znajduje ogłoszenie z kanału RSS, czyta je i publikuje z dwiema odrębnymi sesjami", async () => {
    const a = announcement("Testy w Orłach");
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/testy-orly"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/testy-orly", a.html);
    web.anthropic = () => a.extraction;
    const r = await runDiscover(deps(web, db));
    expect(r.status).toBe("ok");
    expect(r.stats).toMatchObject({ discovered_urls: 1, enqueued: 1, url_listing: 1, listing_published: 1 });
    expect(await listings()).toEqual([{ url: "https://orly-fc.pl/aktualnosci/testy-orly", status: "published", kind: "testy" }]);
    const s = await db.query<{ date: string; eligibility: { birthYears: Array<{ op: string }> }; start_time: string; starts_at: string }>(
      "select to_char(date,'YYYY-MM-DD') as date, eligibility, start_time, starts_at from radar_sessions order by date");
    expect(s.rows.map((x) => [x.date, x.start_time, x.eligibility.birthYears[0]!.op])).toEqual([[D1(), "17:00", "range"], [D2(), "17:00", "in"]]);
    // historia sprawdzeń i przebiegów
    expect((await db.query("select 1 from radar_checks where valid and outcome = 'ok'")).rows.length).toBeGreaterThan(0);
    expect((await db.query<{ status: string }>("select status from radar_job_runs where job = 'discover'")).rows).toEqual([{ status: "ok" }]);
    expect((await db.query<{ state: string }>("select state from radar_urls")).rows).toEqual([{ state: "done" }]);
    // robots.txt pobrany i zapamiętany
    expect((await db.query<{ t: string }>("select robots_txt as t from radar_sources")).rows[0]!.t).toContain("Disallow: /prywatne");
  });

  it("kolejne uruchomienie nie duplikuje; nowy wpis w kanale jest znajdowany bez ręcznego wpisywania adresu", async () => {
    const a = announcement("Testy w Orłach");
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/testy-orly"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/testy-orly", a.html);
    web.anthropic = () => a.extraction;
    await runDiscover(deps(web, db));
    await db.exec("update radar_sources set next_check_at = now() - interval '1 minute'");
    const again = await runDiscover(deps(web, db));
    expect(again.stats.enqueued ?? 0).toBe(0);
    expect(await listings()).toHaveLength(1);

    // nowe ogłoszenie z innymi sesjami
    const b = announcement("Nabór wiosenny", { firstDate: day(9) });
    b.extraction.sessions = b.extraction.sessions.slice(0, 1);
    b.extraction.sessions[0]!.date = day(9);
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/nabor-wiosna", "https://orly-fc.pl/aktualnosci/testy-orly"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/nabor-wiosna", b.html);
    web.anthropic = (u) => (u.endsWith("nabor-wiosna") ? b.extraction : a.extraction);
    await db.exec("update radar_sources set next_check_at = now() - interval '1 minute'");
    const third = await runDiscover(deps(web, db));
    expect(third.stats.enqueued).toBe(1);
    expect((await listings()).map((l) => l.url)).toEqual(["https://orly-fc.pl/aktualnosci/nabor-wiosna", "https://orly-fc.pl/aktualnosci/testy-orly"]);
  });

  it("kolejne strony listy aktualności (paginacja) i mapy witryn (także indeksy) są przeszukiwane", async () => {
    const link = (u: string, t: string) => `<a href="${u}">${t}</a>`;
    await db.exec(`update radar_sources set entry_urls = '{https://orly-fc.pl/aktualnosci}' where id = '${src}'`);
    web.set("https://orly-fc.pl/aktualnosci", `<html><body>${link("/aktualnosci/nabor-1", "Nabór do drużyny")}${link("/o-klubie", "O klubie")}<link rel="next" href="?strona=2"></body></html>`);
    web.set("https://orly-fc.pl/aktualnosci?strona=2", `<html><body>${link("/aktualnosci/testy-2", "Testy piłkarskie")}<a rel="next" href="?strona=3">Następna</a></body></html>`);
    web.set("https://orly-fc.pl/aktualnosci?strona=3", `<html><body>${link("/aktualnosci/trening-3", "Trening otwarty")}</body></html>`);
    const r = await runDiscover(deps(web, db));
    expect(r.stats.discovered_urls).toBe(3);
    expect(web.count("https://orly-fc.pl/aktualnosci?strona=")).toBe(2);

    await db.exec(`update radar_sources set entry_urls = '{https://orly-fc.pl/sitemap.xml}', next_check_at = now() where id = '${src}'`);
    web.set("https://orly-fc.pl/sitemap.xml", { body: `<sitemapindex><sitemap><loc>https://orly-fc.pl/sm1.xml</loc></sitemap></sitemapindex>`, type: "application/xml" });
    web.set("https://orly-fc.pl/sm1.xml", { body: `<urlset><url><loc>https://orly-fc.pl/aktualnosci/testy-bramkarskie</loc><lastmod>2026-11-10</lastmod></url><url><loc>https://orly-fc.pl/sklep</loc></url></urlset>`, type: "application/xml" });
    const r2 = await runDiscover(deps(web, db));
    expect(r2.stats.enqueued).toBe(1);
  });

  it("robots.txt: adres zablokowany nie jest pobierany; blokada całości zatrzymuje źródło", async () => {
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/prywatne/testy", "https://orly-fc.pl/aktualnosci/ok"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/ok", article("Nic", "Wyniki meczu i wywiad z trenerem."));
    const r = await runDiscover(deps(web, db));
    expect(r.stats.discovered_urls).toBe(1); // /prywatne odfiltrowane już przy odkrywaniu
    expect(web.count("https://orly-fc.pl/prywatne")).toBe(0);

    web.set("https://orly-fc.pl/robots.txt", { body: "User-agent: *\nDisallow: /\n", type: "text/plain" });
    await db.exec(`update radar_sources set robots_checked_at = null, next_check_at = now(), robots_txt = null where id = '${src}'`);
    const calls = web.count("https://orly-fc.pl/feed.xml");
    const r2 = await runDiscover(deps(web, db));
    expect(web.count("https://orly-fc.pl/feed.xml")).toBe(calls); // kanału nie pobieramy
    expect(r2.stats.discovered_urls ?? 0).toBe(0);
    // 5xx na robots.txt = ostrożnie nie pobieramy
    web.set("https://orly-fc.pl/robots.txt", { body: "", status: 503, type: "text/plain" });
    await db.exec(`update radar_sources set robots_checked_at = null, next_check_at = now(), robots_block_all = false where id = '${src}'`);
    await runDiscover(deps(web, db));
    expect((await db.query<{ b: boolean }>("select robots_block_all as b from radar_sources")).rows[0]!.b).toBe(true);
  });

  it("adresy poza witryną źródła i z sieci wewnętrznej nie trafiają do kolejki ani nie są pobierane", async () => {
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://evil.pl/nabor", "https://169.254.169.254/latest/meta-data", "https://orly-fc.pl/aktualnosci/ok"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/ok", article("Wyniki", "Wyniki kolejki."));
    const r = await runDiscover(deps(web, db));
    expect(r.stats.discovered_urls).toBe(1);
    expect(web.count("https://evil.pl")).toBe(0);
    expect(web.count("https://169.254")).toBe(0);
  });

  it("strony CAPTCHA i logowania nie są odczytywane ani publikowane; ponowne próby w kolejnych przebiegach", async () => {
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/captcha", "https://orly-fc.pl/aktualnosci/zapisy-konto"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/captcha", `<html><body><div class="g-recaptcha"></div><p>Potwierdź</p></body></html>`);
    web.set("https://orly-fc.pl/aktualnosci/zapisy-konto", `<html><body><p>Zaloguj się</p><input type="password"></body></html>`);
    const r = await runDiscover(deps(web, db));
    expect(r.stats.url_invalid).toBe(2);
    expect(await listings()).toEqual([]);
    expect(web.count("https://api.anthropic.com")).toBe(0);
    const outcomes = (await db.query<{ outcome: string; valid: boolean }>("select outcome, valid from radar_checks order by outcome")).rows;
    expect(outcomes).toEqual([{ outcome: "captcha", valid: false }, { outcome: "login_wall", valid: false }]);
    expect((await db.query<{ state: string }>("select state from radar_urls order by url")).rows.map((x) => x.state)).toEqual(["pending", "pending"]);
  });

  it("strona niebędąca ogłoszeniem nie trafia do modelu (oszczędność), a odpowiedź „nie ogłoszenie” kończy bez zapisu", async () => {
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/wyniki", "https://orly-fc.pl/aktualnosci/nabor-niby"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/wyniki", article("Wyniki", "Wygraliśmy 3:1 z drużyną gości w ostatniej kolejce ligi okręgowej."));
    web.set("https://orly-fc.pl/aktualnosci/nabor-niby", article("Nabór", "Nabór do sekcji szachowej, rocznik 2012, testy wiedzy."));
    web.anthropic = () => ({ is_opportunity: false });
    const r = await runDiscover(deps(web, db));
    expect(web.count("https://api.anthropic.com")).toBe(1); // tylko druga strona przeszła filtr
    expect(r.stats.url_not_opportunity).toBe(2);
    expect(await listings()).toEqual([]);
  });

  it("bez klucza AI ogłoszenia nie są publikowane: adres czeka w kolejce kontroli", async () => {
    const a = announcement("Testy");
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/t"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/t", a.html);
    const r = await runDiscover(deps(web, db, { extractor: null }));
    expect(r.stats.url_no_extractor).toBe(1);
    expect(await listings()).toEqual([]);
    expect((await db.query<{ state: string }>("select state from radar_urls")).rows).toEqual([{ state: "review" }]);
  });

  it("źródło bez zgody na publikację faktów i niejednoznaczne ogłoszenie trafiają do kontroli, nie do użytkowników", async () => {
    const a = announcement("Testy");
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/t"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/t", a.html);
    web.anthropic = () => a.extraction;
    await db.exec(`update radar_sources set allowed_scope = '{"fetch": true, "publish_facts": false, "images": false}' where id = '${src}'`);
    await runDiscover(deps(web, db));
    expect(await listings()).toEqual([{ url: "https://orly-fc.pl/aktualnosci/t", status: "pending_review", kind: "testy" }]);
    expect((await db.query<{ r: string[] }>("select review_reasons as r from radar_listings")).rows[0]!.r).toContain("źródło nie ma zgody na publikację faktów");
    const feedOut = (await db.query<{ f: { listings: unknown[] } }>("select radar_feed() as f")).rows[0]!.f;
    expect(feedOut.listings).toHaveLength(0);
  });

  it("limit czasu partii: reszta kolejki zostaje na następne uruchomienie", async () => {
    const urls = [1, 2, 3].map((i) => `https://orly-fc.pl/aktualnosci/n${i}`);
    web.set("https://orly-fc.pl/feed.xml", { body: feed(...urls), type: "application/rss+xml" });
    for (const u of urls) web.set(u, article("Wyniki", "Wyniki meczów i tabela ligi."));
    let calls = 0;
    const d = deps(web, db);
    d.nowMs = () => (++calls > 40 ? Date.now() + 10_000_000 : Date.now());
    d.deadlineMs = Date.now() + 5_000_000;
    await runDiscover(d);
    const states = (await db.query<{ state: string }>("select state from radar_urls order by url")).rows.map((x) => x.state);
    expect(states.every((s) => s === "pending" || s === "skipped")).toBe(true);
  });
});

describe("refresh: odświeżanie aktywnych ofert", () => {
  async function published(opts: { closed?: boolean } = {}) {
    const a = announcement("Testy w Orłach", opts);
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/t"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/t", a.html);
    web.anthropic = () => a.extraction;
    await runDiscover(deps(web, db));
    const id = (await db.query<{ id: string }>("select id from radar_listings")).rows[0]!.id;
    return { id, a };
  }
  const old = (id: string, h = 7) => db.exec(`update radar_listings set source_checked_at = now() - interval '${h} hours' where id = '${id}'`);
  const checkedAt = async (id: string) => new Date((await db.query<{ t: string }>("select source_checked_at as t from radar_listings where id = $1", [id])).rows[0]!.t).getTime();

  it("niezmieniona strona odnawia source_checked_at, ale NIE organizer_confirmed_at", async () => {
    const { id } = await published();
    await old(id);
    const before = await checkedAt(id);
    const r = await runRefresh(deps(web, db));
    expect(r.stats).toMatchObject({ refresh_unchanged: 1 });
    expect(await checkedAt(id)).toBeGreaterThan(before);
    expect((await db.query<{ c: string | null }>("select organizer_confirmed_at as c from radar_listings")).rows[0]!.c).toBeNull();
    expect(web.count("https://api.anthropic.com")).toBe(1); // model nie jest wołany przy braku zmian
  });

  it("ogłoszenia sprawdzone niedawno nie są pobierane ponownie (respektowanie odstępu źródła)", async () => {
    await published();
    const calls = web.count("https://orly-fc.pl/aktualnosci/t");
    await runRefresh(deps(web, db));
    expect(web.count("https://orly-fc.pl/aktualnosci/t")).toBe(calls);
  });

  it("CAPTCHA, błąd serwera i ekran logowania NIE odnawiają znacznika aktualności", async () => {
    const { id } = await published();
    for (const page of [
      { body: `<html><body><div class="g-recaptcha"></div></body></html>` },
      { body: "Błąd", status: 503, type: "text/plain" },
      { body: `<form><p>Zaloguj się</p><input type="password"></form>` },
    ]) {
      await old(id);
      const before = await checkedAt(id);
      web.set("https://orly-fc.pl/aktualnosci/t", page);
      await runRefresh(deps(web, db));
      expect(await checkedAt(id)).toBe(before);
    }
    // po 48 h bez poprawnego sprawdzenia oferta znika (zadanie expire), choć status wciąż „published” do tego czasu
    await old(id, 49);
    expect((await db.query<{ f: { listings: unknown[] } }>("select radar_feed() as f")).rows[0]!.f.listings).toHaveLength(0);
    await db.query("select radar_run_expire()");
    expect((await db.query<{ status: string }>("select status from radar_listings")).rows[0]!.status).toBe("expired");
  });

  it("zmiana treści: nowy odczyt aktualizuje termin; zamknięcie zapisów wygasza rekomendowanie", async () => {
    const { id } = await published();
    const b = announcement("Testy w Orłach – ZMIANA", { firstDate: day(7) });
    web.set("https://orly-fc.pl/aktualnosci/t", b.html);
    web.anthropic = () => b.extraction;
    await old(id);
    await runRefresh(deps(web, db));
    const dates = (await db.query<{ d: string; status: string }>("select to_char(date,'YYYY-MM-DD') as d, status from radar_sessions order by status, d")).rows;
    expect(dates.filter((x) => x.status === "active").map((x) => x.d)).toEqual([day(6), day(7)]);
    expect(dates.filter((x) => x.status === "cancelled").map((x) => x.d)).toEqual([day(5)]); // stary termin odwołany, historia zostaje

    const closed = announcement("Testy w Orłach – ZAMKNIĘTE", { firstDate: day(7), closed: true });
    web.set("https://orly-fc.pl/aktualnosci/t", closed.html);
    web.anthropic = () => closed.extraction;
    await old(id);
    await runRefresh(deps(web, db));
    expect((await db.query<{ s: string }>("select signup_status as s from radar_listings")).rows[0]!.s).toBe("closed");
    expect((await db.query<{ f: { listings: unknown[] } }>("select radar_feed() as f")).rows[0]!.f.listings).toHaveLength(0);
  });

  it("strona usunięta (404) wygasza ofertę od razu", async () => {
    const { id } = await published();
    web.pages.delete("https://orly-fc.pl/aktualnosci/t");
    await old(id);
    await runRefresh(deps(web, db));
    expect((await db.query<{ status: string }>("select status from radar_listings")).rows[0]!.status).toBe("expired");
  });

  it("wygasła z powodu nieaktualności źródła wraca, gdy źródło znów odpowiada poprawnie", async () => {
    const { id, a } = await published();
    await old(id, 60);
    await db.query("select radar_run_expire()");
    expect((await db.query<{ status: string }>("select status from radar_listings")).rows[0]!.status).toBe("expired");
    web.set("https://orly-fc.pl/aktualnosci/t", a.html + " "); // inna treść → ponowny odczyt
    web.anthropic = () => a.extraction;
    await runRefresh(deps(web, db));
    expect((await db.query<{ status: string }>("select status from radar_listings")).rows[0]!.status).toBe("published");
  });

  it("zmiana treści bez możliwości odczytu (brak klucza/budżetu) nie potwierdza aktualności", async () => {
    const { id } = await published();
    web.set("https://orly-fc.pl/aktualnosci/t", article("Zmieniona", "Nowa treść ogłoszenia o testach i roczniku, szczegóły wkrótce. ".repeat(3)));
    await old(id);
    const before = await checkedAt(id);
    await runRefresh(deps(web, db, { extractor: null }));
    expect(await checkedAt(id)).toBe(before);
    expect((await db.query<{ outcome: string }>("select outcome from radar_checks where outcome = 'changed_unparsed'")).rows).toHaveLength(1);
  });

  it("nabór bezterminowy z potwierdzeniem organizatora jest aktualny 7 dni; ponowne pobranie tej samej strony go nie przedłuża", async () => {
    const a = announcement("Nabór cały rok", { update: day(-1), confirm: day(-1) });
    a.extraction.sessions = [];
    (a.extraction as Record<string, unknown>).indefinite = q("true", "Nabór prowadzimy przez cały rok");
    (a.extraction as Record<string, unknown>).eligibility_default = { birth_years: [{ op: "range", from: 2012, to: 2014 }], evidence: "roczniki 2012–2013" };
    a.extraction.signup_status = q("open", "Zgłoszenia indywidualne przyjmujemy do końca tygodnia");
    const html = a.html.replace("Rocznik, wiek i testy", "Nabór prowadzimy przez cały rok. Rocznik, wiek i testy");
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/ciagly"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/ciagly", html);
    web.anthropic = () => a.extraction;
    // cytat 2012–2014 nie występuje w tekście → zasady wieku niejednoznaczne → kontrola; poprawiamy cytat
    (a.extraction as Record<string, unknown>).eligibility_default = { birth_years: [{ op: "range", from: 2012, to: 2013 }], evidence: "roczniki 2012–2013" };
    await runDiscover(deps(web, db));
    const row = (await db.query<{ status: string; indefinite: boolean; c: string }>("select status, indefinite, organizer_confirmed_at as c from radar_listings")).rows[0]!;
    expect([row.status, row.indefinite]).toEqual(["published", true]);
    expect(row.c).not.toBeNull();
    const meta = (await db.query<{ m: { method: string; evidence: string }; p: string | null }>("select organizer_confirmation as m, page_updated_at as p from radar_listings")).rows[0]!;
    expect(meta.m.method).toBe("page_statement");
    expect(meta.m.evidence).toMatch(/potwierdzamy/);
    expect(meta.p).not.toBeNull(); // data aktualizacji strony zapisana osobno
    expect((await db.query<{ f: { listings: unknown[] } }>("select radar_feed() as f")).rows[0]!.f.listings).toHaveLength(1);
    // minęło 8 dni od potwierdzenia, strona ta sama (stara) – ponowne pobranie nie odnawia potwierdzenia
    await db.exec("update radar_listings set organizer_confirmed_at = now() - interval '8 days', source_checked_at = now() - interval '7 hours'");
    await runRefresh(deps(web, db));
    expect((await db.query<{ f: { listings: unknown[] } }>("select radar_feed() as f")).rows[0]!.f.listings).toHaveLength(0);
    await db.query("select radar_run_expire()");
    expect((await db.query<{ status: string }>("select status from radar_listings")).rows[0]!.status).toBe("expired");
  });

  it("sama data aktualizacji strony NIE jest potwierdzeniem organizatora: nabór bezterminowy nie jest wtedy aktualny", async () => {
    const a = announcement("Nabór cały rok", { update: day(-1) }); // „Aktualizacja ogłoszenia: …”, bez oświadczenia o aktualności
    a.extraction.sessions = [];
    (a.extraction as Record<string, unknown>).indefinite = q("true", "Nabór prowadzimy przez cały rok");
    (a.extraction as Record<string, unknown>).eligibility_default = { birth_years: [{ op: "range", from: 2012, to: 2013 }], evidence: "roczniki 2012–2013" };
    const html = a.html.replace("Rocznik, wiek i testy", "Nabór prowadzimy przez cały rok. Rocznik, wiek i testy");
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/ciagly"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/ciagly", html);
    web.anthropic = () => a.extraction;
    await runDiscover(deps(web, db));
    const row = (await db.query<{ c: string | null; m: unknown; p: string | null }>("select organizer_confirmed_at as c, organizer_confirmation as m, page_updated_at as p from radar_listings")).rows[0]!;
    expect(row.c).toBeNull();
    expect(row.m).toBeNull();
    expect(row.p).not.toBeNull();
    expect((await db.query<{ f: { listings: unknown[] } }>("select radar_feed() as f")).rows[0]!.f.listings).toHaveLength(0);
  });

  it("do modelu nie trafiają adresy e-mail ani numery telefonów z treści strony", async () => {
    const a = announcement("Testy z kontaktem");
    const html = a.html.replace("Rocznik, wiek i testy", "Kontakt: trener.jan@orly-fc.pl, tel. +48 600 123 456. Rocznik, wiek i testy");
    web.set("https://orly-fc.pl/feed.xml", { body: feed("https://orly-fc.pl/aktualnosci/testy-z-trenerem"), type: "application/rss+xml" });
    web.set("https://orly-fc.pl/aktualnosci/testy-z-trenerem", html);
    web.anthropic = () => a.extraction;
    await runDiscover(deps(web, db));
    expect(web.anthropicSent.length).toBeGreaterThan(0);
    for (const sent of web.anthropicSent) {
      expect(sent).not.toMatch(/trener\.jan@|600 123 456/);
      expect(sent).toContain("[e-mail usunięty]");
    }
  });
});

describe("wyszukiwanie cykliczne (Brave)", () => {
  it("wynik z nowej domeny to KANDYDAT do oceny (bez pobierania), z zatwierdzonej – adres do weryfikacji na stronie organizatora; media społecznościowe pomijane", async () => {
    web.brave = [
      { url: "https://nowy-klub.pl/nabor-2012", title: "Nabór 2012" },
      { url: "https://orly-fc.pl/aktualnosci/testy-orly", title: "Testy Orły" },
      { url: "https://www.facebook.com/klub/posts/123", title: "Post" },
    ];
    const a = announcement("Testy w Orłach");
    web.set("https://orly-fc.pl/aktualnosci/testy-orly", a.html);
    web.anthropic = () => a.extraction;
    await db.exec(`update radar_sources set entry_urls = '{}' where id = '${src}'`);
    const r = await runDiscover(deps(web, db));
    expect(r.stats.search_candidates).toBeGreaterThan(0);
    expect(r.stats.search_social_skipped).toBeGreaterThan(0);
    expect(web.count("https://nowy-klub.pl")).toBe(0); // brak pobierania z niezatwierdzonej domeny
    expect(web.count("https://www.facebook.com")).toBe(0);
    const cand = (await db.query<{ domain: string; status: string; seen_count: number }>("select domain, status, seen_count from radar_sources where domain <> 'orly-fc.pl'")).rows;
    expect(cand).toEqual([{ domain: "nowy-klub.pl", status: "candidate", seen_count: expect.any(Number) }]);
    // wynik z zatwierdzonej domeny został zweryfikowany na jej stronie i opublikowany; fragment wyniku nie był podstawą
    expect(await listings()).toEqual([{ url: "https://orly-fc.pl/aktualnosci/testy-orly", status: "published", kind: "testy" }]);
  });

  it("zapytania mają budżet dzienny i nie zawierają danych osobowych; po wyczerpaniu wyszukiwanie się wstrzymuje", async () => {
    web.brave = [];
    await db.exec("update radar_settings set value = '25' where key = 'brave_queries_per_run'; update radar_settings set value = '40' where key = 'brave_daily_query_budget'");
    const r1 = await runDiscover(deps(web, db));
    expect(r1.stats.search_queries).toBe(25);
    await db.exec("delete from radar_job_locks");
    const r2 = await runDiscover(deps(web, db));
    expect(r2.stats.search_queries).toBe(15); // reszta budżetu
    await db.exec("delete from radar_job_locks");
    const r3 = await runDiscover(deps(web, db));
    expect(r3.stats.search_budget_exhausted).toBe(1);
    const queries = web.log.filter((u) => u.startsWith("https://api.search.brave.com")).map((u) => new URL(u).searchParams.get("q")!);
    expect(queries.every((x) => /testy|nabór|trening|bramkarsk/.test(x))).toBe(true);
    expect(queries.some((x) => /2026|2027/.test(x))).toBe(true); // okresy z bieżącej daty
  });

  it("limit lub błąd klucza API przerywa wyszukiwanie bez wyjątku; brak klucza pomija krok", async () => {
    web.braveStatus = 401;
    const r = await runDiscover(deps(web, db));
    expect(r.status).toBe("ok");
    expect(r.stats.search_unauthorized).toBe(1);
    await db.exec("delete from radar_job_locks; delete from radar_search_usage");
    const none = await runDiscover(deps(web, db, { brave: null }));
    expect(none.stats.search_skipped_no_key).toBe(1);
  });
});

describe("blokady i awarie", () => {
  it("równoległe uruchomienie tego samego zadania jest pomijane, a po zakończeniu można uruchomić je ponownie", async () => {
    const slow = new Web();
    slow.set("https://orly-fc.pl/robots.txt", { body: "", type: "text/plain" });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    slow.set("https://orly-fc.pl/feed.xml", { body: feed(), type: "application/rss+xml" });
    const d1 = deps(slow, db, { sleep: async () => {} });
    const orig = slow.fetch;
    slow.fetch = (async (u: string, i: RequestInit) => { if (String(u).includes("feed.xml")) await gate; return orig(u, i); }) as typeof fetch;
    d1.fetchDeps.fetch = slow.fetch;
    const first = runDiscover(d1);
    await new Promise((r) => setTimeout(r, 50));
    const second = await runDiscover(deps(web, db));
    expect(second.status).toBe("skipped");
    release();
    expect((await first).status).toBe("ok");
    expect((await runDiscover(deps(web, db))).status).toBe("ok");
  });

  it("awaria źródła: kolejne błędy wydłużają odstęp i podnoszą alert; wyjątek zadania kończy przebieg jako failed z alertem", async () => {
    const alerts: string[] = [];
    web.pages.delete("https://orly-fc.pl/feed.xml"); // 404
    for (let i = 0; i < 3; i++) {
      await db.exec("update radar_sources set next_check_at = now(); delete from radar_job_locks");
      await runDiscover(deps(web, db, { alert: async (m) => { alerts.push(m); } }));
    }
    const s = (await db.query<{ consecutive_failures: number; last_error: string }>("select consecutive_failures, last_error from radar_sources")).rows[0]!;
    expect(s.consecutive_failures).toBe(3);
    expect(alerts.some((m) => /źródła z kolejnymi błędami/.test(m))).toBe(true);
    const health = (await db.query<{ h: { failingSources: number } }>("select radar_health() as h")).rows[0]!.h;
    expect(health.failingSources).toBe(1);

    await db.exec("delete from radar_job_locks");
    const boom = deps(web, db, { rpc: async (fn, args) => { if (fn === "radar_due_sources") throw new Error("baza niedostępna"); return pgRpc(db)(fn, args); }, alert: async (m) => { alerts.push(m); } });
    const r = await runDiscover(boom);
    expect(r.status).toBe("failed");
    expect(alerts.some((m) => /baza niedostępna/.test(m))).toBe(true);
    const run = (await db.query<{ status: string; error: string }>("select status, error from radar_job_runs where job = 'discover' order by started_at desc limit 1")).rows[0]!;
    expect(run).toMatchObject({ status: "failed", error: "baza niedostępna" });
    expect((await db.query("select 1 from radar_job_locks")).rows).toHaveLength(0); // blokada zwolniona po awarii
  });
});
