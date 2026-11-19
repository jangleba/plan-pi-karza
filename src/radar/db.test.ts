import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { listingFreshness } from "../../supabase/functions/_shared/radar/freshness.ts";
import type { RadarListing } from "../../supabase/functions/_shared/radar/types.ts";
import { ADMIN, U1, U2, asRole, freshDb } from "./pg.ts";

const NOW = "2026-11-19T12:00:00Z";
const NOW_MS = Date.parse(NOW);
const iso = (ms: number) => new Date(ms).toISOString();
const H = 3_600_000;

let db: PGlite;
let srcId: string;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`insert into auth.users (id) values ('${U1}'), ('${U2}'), ('${ADMIN}'); insert into radar_admins (user_id) values ('${ADMIN}')`);
  const r = await db.query<{ id: string }>(
    `insert into radar_sources (domain, name, status, license_basis, allowed_scope, entry_urls)
     values ('orly.example', 'Orły', 'approved', 'Umowa o publikacji faktów z dnia 2026-11-01', '{"fetch": true, "publish_facts": true, "images": false}', '{https://orly.example/feed}') returning id`);
  srcId = r.rows[0]!.id;
}, 60_000);

const ses = (date: string, fp: string, over: Record<string, unknown> = {}) => ({
  date, startTime: null, startsAt: null, city: null, venue: null, lat: null, lon: null, fingerprint: fp, evidence: "dowód",
  eligibility: { birthYears: [{ op: "in", years: [2011] }] }, ...over,
});
const payload = (over: Record<string, unknown> = {}, listing: Record<string, unknown> = {}) => ({
  url: "https://orly.example/testy", urlHash: "h-orly-1", sourceId: srcId, contentHash: "c1", publish: true, reviewReasons: [], organizerConfirmedAt: null,
  listing: { kind: "testy", organizer: "APO Orły", summary: "Otwarte testy.", city: "Kraków", lat: 50.061, lon: 19.937, positions: { scope: "all" }, signupMode: "individual",
    signupStatus: "open", costState: "free", indefinite: false, signupClosesAt: null, ...listing },
  sessions: [ses("2026-11-24", `fp-a-${over.urlHash ?? "h-orly-1"}`), ses("2026-11-25", `fp-b-${over.urlHash ?? "h-orly-1"}`, { eligibility: { birthYears: [{ op: "in", years: [2014] }] } })],
  evidence: [{ field: "organizer", quote: "APO Orły" }], ...over,
});
const upsert = async (p: unknown) => (await db.query<{ r: { id: string; status: string; created: boolean; changed: boolean } }>("select radar_upsert_listing($1::jsonb) as r", [JSON.stringify(p)])).rows[0]!.r;
const q1 = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, any>>(sql, params)).rows[0]!; // eslint-disable-line @typescript-eslint/no-explicit-any
const row = async (id: string) => (await db.query<Record<string, unknown>>("select * from radar_listings where id = $1", [id])).rows[0]!;

describe("zapis ogłoszenia i sesje", () => {
  it("tworzy ogłoszenie i OSOBNE sesje z własnymi zasadami wieku", async () => {
    const r = await upsert(payload());
    expect(r).toMatchObject({ status: "published", created: true });
    const s = await db.query<{ date: string; start_time: string; eligibility: { birthYears: Array<{ years: number[] }> } }>(
      "select to_char(date, 'YYYY-MM-DD') as date, start_time, eligibility from radar_sessions where listing_id = $1 order by date", [r.id]);
    expect(s.rows.map((x) => [x.date, x.eligibility.birthYears[0]!.years])).toEqual([["2026-11-24", [2011]], ["2026-11-25", [2014]]]);
    const l = await row(r.id);
    expect(l.source_checked_at).not.toBeNull();
    expect(l.organizer_confirmed_at).toBeNull(); // samo pobranie nie jest potwierdzeniem organizatora
  });

  it("ponowny zapis jest idempotentny, a zmiana terminu aktualizuje sesję i oznacza changed", async () => {
    const p = payload({ urlHash: "h-idem", url: "https://orly.example/idem" });
    const a = await upsert(p);
    const b = await upsert(p);
    expect([b.id, b.created, b.changed]).toEqual([a.id, false, false]);
    expect((await db.query("select 1 from radar_sessions where listing_id = $1", [a.id])).rows).toHaveLength(2);
    const c = await upsert(payload({ urlHash: "h-idem", url: "https://orly.example/idem", contentHash: "c2", sessions: [ses("2026-11-24", "fp-a-h-idem", { startsAt: "2026-11-24T16:00:00Z", startTime: "17:00" }), ses("2026-11-25", "fp-b-h-idem")] }));
    expect(c.changed).toBe(true);
    const all = await db.query<{ status: string; start_time: string }>("select status, start_time from radar_sessions where listing_id = $1 order by status, start_time", [a.id]);
    // dawna sesja bez godziny została odwołana (historia zostaje), nowa z godziną aktywna
    expect(all.rows.filter((x) => x.status === "active")).toHaveLength(2);
    expect(all.rows.filter((x) => x.status === "cancelled")).toHaveLength(1);
  });

  it("sesja usunięta z ogłoszenia jest oznaczana jako odwołana, nie kasowana", async () => {
    const base = { urlHash: "h-drop", url: "https://orly.example/drop" };
    const a = await upsert(payload(base));
    await upsert(payload({ ...base, contentHash: "c3", sessions: [ses("2026-11-24", "fp-a-h-drop")] }));
    const r = await db.query<{ status: string }>("select status from radar_sessions where listing_id = $1 and fingerprint = 'fp-b-h-drop'", [a.id]);
    expect(r.rows[0]!.status).toBe("cancelled");
  });

  it("organizer_confirmed_at zmienia się tylko, gdy treść niesie NOWSZE potwierdzenie; stara strona go nie odnawia", async () => {
    const base = { urlHash: "h-conf", url: "https://orly.example/conf" };
    const ev = { method: "page_statement", evidence: "Informacja aktualna na dzień 10.11.2026" };
    const a = await upsert(payload({ ...base, organizerConfirmedAt: "2026-11-10T08:00:00Z", organizerConfirmation: ev }));
    await upsert(payload({ ...base, organizerConfirmedAt: null })); // ponowne pobranie tej samej strony
    expect(iso((await row(a.id)).organizer_confirmed_at as unknown as number)).toBeDefined();
    expect(new Date((await row(a.id)).organizer_confirmed_at as string).toISOString()).toBe("2026-11-10T08:00:00.000Z");
    await upsert(payload({ ...base, organizerConfirmedAt: "2026-11-05T08:00:00Z", organizerConfirmation: ev })); // starsza data nie cofa
    expect(new Date((await row(a.id)).organizer_confirmed_at as string).toISOString()).toBe("2026-11-10T08:00:00.000Z");
    await upsert(payload({ ...base, organizerConfirmedAt: "2026-11-18T08:00:00Z", organizerConfirmation: { ...ev, evidence: "Potwierdzamy: nabór nadal trwa (18.11.2026)" } }));
    expect(new Date((await row(a.id)).organizer_confirmed_at as string).toISOString()).toBe("2026-11-18T08:00:00.000Z");
    expect((await q1("select organizer_confirmation->>'evidence' as e from radar_listings where id = $1", [a.id])).e).toMatch(/Potwierdzamy/);
  });

  it("potwierdzenie organizatora wymaga dowodu: sama data (bez method/evidence) jest ignorowana, a data aktualizacji strony zapisuje się osobno", async () => {
    const base = { urlHash: "h-page", url: "https://orly.example/page" };
    const a = await upsert(payload({ ...base, organizerConfirmedAt: "2026-11-10T08:00:00Z", pageUpdatedAt: "2026-11-12T08:00:00Z" }));
    const r = await row(a.id);
    expect(r.organizer_confirmed_at).toBeNull();
    expect(new Date(r.page_updated_at as string).toISOString()).toBe("2026-11-12T08:00:00.000Z");
    await expect(db.query("update radar_listings set organizer_confirmed_at = now() where id = $1", [a.id])).rejects.toThrow(/radar_confirmed_needs_evidence/); // ograniczenie w bazie
    await upsert(payload({ ...base, organizerConfirmedAt: "2026-11-10T08:00:00Z", organizerConfirmation: { method: "admin_contact", evidence: "x" } })); // metoda tylko dla administratora
    expect((await row(a.id)).organizer_confirmed_at).toBeNull();
  });

  it("akcja administratora „confirm” wymaga notatki-dowodu i zapisuje metodę admin_contact", async () => {
    const a = await upsert(payload({ urlHash: "h-adm", url: "https://orly.example/adm" }));
    await expect(asRole(db, "authenticated", ADMIN, () => db.query("select radar_admin_set_listing($1, 'confirm', null)", [a.id]))).rejects.toThrow(/wymaga notatki/);
    await expect(asRole(db, "authenticated", ADMIN, () => db.query("select radar_admin_set_listing($1, 'confirm', 'ok')", [a.id]))).rejects.toThrow(/wymaga notatki/);
    await asRole(db, "authenticated", ADMIN, () => db.query("select radar_admin_set_listing($1, 'confirm', 'odpowiedź e-mail organizatora z 12.11.2026')", [a.id]));
    const r = await row(a.id);
    expect(r.organizer_confirmed_at).not.toBeNull();
    expect((await q1("select organizer_confirmation as c from radar_listings where id = $1", [a.id])).c).toMatchObject({ method: "admin_contact", evidence: expect.stringContaining("12.11.2026") });
    expect(JSON.stringify((await db.query("select radar_listing_json(l) as j from radar_listings l where id = $1", [a.id])).rows[0])).toContain("organizerConfirmation");
  });

  it("niejednoznaczne ogłoszenie trafia do kontroli (pending_review), a wycofane przez administratora zostaje wycofane", async () => {
    const a = await upsert(payload({ urlHash: "h-rev", url: "https://orly.example/rev", publish: false, reviewReasons: ["sesja bez jednoznacznych zasad wieku"] }));
    expect(a.status).toBe("pending_review");
    expect((await row(a.id)).review_reasons).toEqual(["sesja bez jednoznacznych zasad wieku"]);
    await db.exec(`update radar_listings set status = 'withdrawn' where id = '${a.id}'`);
    expect((await upsert(payload({ urlHash: "h-rev", url: "https://orly.example/rev", publish: true }))).status).toBe("withdrawn");
  });

  it("duplikat sesji z innej publikacji nie tworzy drugiej oferty; ogłoszenie z częścią nowych sesji zostaje", async () => {
    const first = await upsert(payload({ urlHash: "h-d1", url: "https://orly.example/d1", sessions: [ses("2026-12-01", "fp-dup")] }));
    const dup = await upsert(payload({ urlHash: "h-d2", url: "https://aggregator.example/d2", sessions: [ses("2026-12-01", "fp-dup")] }));
    expect(dup.status).toBe("duplicate");
    expect((await row(dup.id)).duplicate_of).toBe(first.id);
    const partial = await upsert(payload({ urlHash: "h-d3", url: "https://orly.example/d3", sessions: [ses("2026-12-01", "fp-dup"), ses("2026-12-02", "fp-new")] }));
    expect(partial.status).toBe("published");
  });

  it("dowody są podmieniane przy każdym zapisie", async () => {
    const base = { urlHash: "h-ev", url: "https://orly.example/ev" };
    const a = await upsert(payload({ ...base, evidence: [{ field: "a", quote: "x" }, { field: "b", quote: "y" }] }));
    await upsert(payload({ ...base, evidence: [{ field: "c", quote: "z" }] }));
    expect((await db.query("select field from radar_evidence where listing_id = $1", [a.id])).rows).toEqual([{ field: "c" }]);
  });
});

describe("źródła, sprawdzenia i znacznik aktualności", () => {
  it("zatwierdzone źródło wymaga podstawy dopuszczenia", async () => {
    await expect(db.exec("insert into radar_sources (domain, status) values ('bez-podstawy.example', 'approved')")).rejects.toThrow();
    await expect(db.exec("insert into radar_sources (domain, status, license_basis) values ('krotka.example', 'approved', 'tak')")).rejects.toThrow();
  });

  it("tylko poprawne sprawdzenie odnawia source_checked_at; błąd, CAPTCHA i logowanie nie", async () => {
    const a = await upsert(payload({ urlHash: "h-chk", url: "https://orly.example/chk" }));
    await db.exec(`update radar_listings set source_checked_at = '2026-11-15T00:00:00Z' where id = '${a.id}'`);
    for (const outcome of ["http_error", "captcha", "login_wall", "empty", "timeout"]) {
      await db.query("select radar_record_check($1, $2, 'u', $3, 200, false, null)", [a.id, srcId, outcome]);
    }
    expect(new Date((await row(a.id)).source_checked_at as string).toISOString()).toBe("2026-11-15T00:00:00.000Z");
    await db.query("select radar_record_check($1, $2, 'u', 'ok', 200, true, 'h')", [a.id, srcId]);
    expect(new Date((await row(a.id)).source_checked_at as string).getTime()).toBeGreaterThan(Date.parse("2026-11-19T00:00:00Z"));
    const n = await db.query<{ n: number }>("select count(*)::int as n from radar_checks where listing_id = $1", [a.id]);
    expect(n.rows[0]!.n).toBe(6); // pełna historia sprawdzeń
  });

  it("błędy źródła wydłużają odstęp kolejnego sprawdzenia, a poprawne przywracają zwykły", async () => {
    const next = async () => (await db.query<{ m: number }>("select extract(epoch from (next_check_at - now()))::int / 60 as m from radar_sources where id = $1", [srcId])).rows[0]!.m;
    await db.query("select radar_mark_source_checked($1, true)", [srcId]);
    const ok = await next();
    await db.query("select radar_mark_source_checked($1, false, 'timeout')", [srcId]);
    await db.query("select radar_mark_source_checked($1, false, 'timeout')", [srcId]);
    expect(await next()).toBeGreaterThan(ok * 2);
    await db.query("select radar_mark_source_checked($1, true)", [srcId]);
    expect(await next()).toBeLessThanOrEqual(ok + 1);
    expect(ok).toBeGreaterThanOrEqual(359);
  });
});

describe("parytet reguł aktualności SQL ↔ TypeScript", () => {
  it("radar_listing_live zgadza się z listingFreshness dla setek kombinacji", async () => {
    const nows = [NOW_MS, NOW_MS + 11 * H, NOW_MS + 60 * H];
    const signups = ["open", "closed", "unknown"] as const;
    const checks: Array<number | null> = [1 * H, 49 * H, null];
    const closes: Array<number | null> = [null, -2 * H, 30 * H];
    const shapes: Array<{ indefinite: boolean; confirmed: number | null; sessions: Array<{ date: string; startsAt: string | null; status: "active" | "cancelled" }> }> = [
      { indefinite: false, confirmed: null, sessions: [{ date: "2026-11-25", startsAt: null, status: "active" }] },
      { indefinite: false, confirmed: null, sessions: [{ date: "2026-11-10", startsAt: null, status: "active" }] },
      { indefinite: false, confirmed: null, sessions: [{ date: "2026-11-25", startsAt: null, status: "cancelled" }, { date: "2026-11-12", startsAt: null, status: "active" }] },
      { indefinite: false, confirmed: null, sessions: [{ date: "2026-11-19", startsAt: "2026-11-19T17:00:00Z", status: "active" }] },
      { indefinite: false, confirmed: null, sessions: [{ date: "2026-11-20", startsAt: null, status: "active" }] },
      { indefinite: true, confirmed: 1 * 24 * H, sessions: [] },
      { indefinite: true, confirmed: 8 * 24 * H, sessions: [] },
      { indefinite: true, confirmed: null, sessions: [] },
    ];
    let compared = 0;
    for (const signup of signups) for (const chk of checks) for (const shape of shapes) for (const cl of closes) {
      const rec = await db.query<{ id: string }>(
        `insert into radar_listings (url, url_hash, kind, organizer, summary, signup_status, indefinite, signup_closes_at, status, source_checked_at, organizer_confirmed_at, organizer_confirmation)
         values ('https://x.example/' || gen_random_uuid(), gen_random_uuid()::text, 'testy', 'O', 'S', $1, $2, $3, 'published', $4, $5, case when $5::timestamptz is null then null else '{"method":"page_statement","evidence":"aktualne na dzień"}'::jsonb end) returning id`,
        [signup, shape.indefinite, cl === null ? null : iso(NOW_MS + cl), chk === null ? null : iso(NOW_MS - chk), shape.confirmed === null ? null : iso(NOW_MS - shape.confirmed)]);
      const id = rec.rows[0]!.id;
      for (const [i, s] of shape.sessions.entries()) {
        await db.query("insert into radar_sessions (listing_id, date, starts_at, status, fingerprint) values ($1, $2, $3, $4, $5)", [id, s.date, s.startsAt, s.status, `fp${i}`]);
      }
      const ts: RadarListing = {
        id, url: "u", kind: "testy", organizer: "O", summary: "S", positions: { scope: "all" }, signupMode: "individual", signupStatus: signup, costState: "unknown",
        indefinite: shape.indefinite, status: "published", signupClosesAt: cl === null ? null : iso(NOW_MS + cl),
        sourceCheckedAt: chk === null ? null : iso(NOW_MS - chk), organizerConfirmedAt: shape.confirmed === null ? null : iso(NOW_MS - shape.confirmed),
        sessions: shape.sessions.map((s, i) => ({ id: `s${i}`, date: s.date, startsAt: s.startsAt, status: s.status })),
      };
      const sql = await db.query<{ live: boolean }>(
        `select radar_listing_live(l, $2::timestamptz) as live from radar_listings l where id = $1`, [id, iso(nows[0]!)]);
      expect(sql.rows[0]!.live, JSON.stringify({ signup, chk, shape, cl })).toBe(listingFreshness(ts, nows[0]!).live);
      for (const n of nows.slice(1)) {
        const r = await db.query<{ live: boolean }>("select radar_listing_live(l, $2::timestamptz) as live from radar_listings l where id = $1", [id, iso(n)]);
        expect(r.rows[0]!.live, `${JSON.stringify({ signup, chk, shape, cl })} @${iso(n)}`).toBe(listingFreshness(ts, n).live);
      }
      compared++;
    }
    expect(compared).toBe(3 * 3 * 8 * 3);
  }, 120_000);
});

describe("wygasanie, odczyt publiczny i zapisane oferty", () => {
  it("radar_expire wygasza przeterminowane i nie rusza aktualnych; jest idempotentne", async () => {
    await db.exec("delete from radar_listings");
    const fresh = await upsert(payload({ urlHash: "h-e1", url: "https://orly.example/e1" }));
    const stale = await upsert(payload({ urlHash: "h-e2", url: "https://orly.example/e2" }));
    const past = await upsert(payload({ urlHash: "h-e3", url: "https://orly.example/e3", sessions: [ses("2026-11-01", "fp-old-h-e3")] }));
    await db.exec(`update radar_listings set source_checked_at = now() - interval '3 days' where id = '${stale.id}'`);
    const r1 = await db.query<{ r: { expired: number } }>("select radar_expire() as r");
    expect(r1.rows[0]!.r.expired).toBe(2);
    expect((await row(fresh.id)).status).toBe("published");
    expect((await row(stale.id)).status).toBe("expired");
    expect((await row(past.id)).status).toBe("expired");
    expect((await db.query<{ r: { expired: number } }>("select radar_expire() as r")).rows[0]!.r.expired).toBe(0);
  });

  it("odświeżenie z poprawnym sprawdzeniem przywraca wygasłe ogłoszenie", async () => {
    const e = (await db.query<{ id: string }>("select id from radar_listings where url_hash = 'h-e2'")).rows[0]!.id;
    expect((await row(e)).status).toBe("expired");
    await upsert(payload({ urlHash: "h-e2", url: "https://orly.example/e2", contentHash: "c-new" }));
    expect((await row(e)).status).toBe("published");
  });

  it("feed zwraca tylko aktualne ogłoszenia, nawet gdy zadanie wygaszające jeszcze nie działało", async () => {
    await db.exec("delete from radar_listings");
    const ok = await upsert(payload({ urlHash: "h-f1", url: "https://orly.example/f1" }));
    const late = await upsert(payload({ urlHash: "h-f2", url: "https://orly.example/f2" }));
    await upsert(payload({ urlHash: "h-f3", url: "https://orly.example/f3", publish: false, reviewReasons: ["x"] }));
    await db.exec(`update radar_listings set source_checked_at = now() - interval '49 hours' where id = '${late.id}'`); // status nadal 'published'
    const feed = (await asRole(db, "anon", null, () => db.query<{ f: { listings: Array<{ id: string; sessions: Array<{ eligibility: unknown }> }>; serverNow: string; health: unknown } }>("select radar_feed() as f"))).rows[0]!.f;
    expect(feed.listings.map((l) => l.id)).toEqual([ok.id]);
    expect(feed.listings[0]!.sessions).toHaveLength(2);
    expect(feed.serverNow).toBeTruthy();
    expect(feed.health).toMatchObject({ approvedSources: 1 });
    expect(JSON.stringify(feed)).not.toMatch(/review_reasons|content_hash|license_basis|reviewReasons/);
  });

  it("zapisane oferty: wygasłe wracają z właściwym statusem, oczekujące na kontrolę nie są ujawniane", async () => {
    await db.exec("delete from radar_listings");
    const a = await upsert(payload({ urlHash: "h-s1", url: "https://orly.example/s1" }));
    const b = await upsert(payload({ urlHash: "h-s2", url: "https://orly.example/s2", publish: false, reviewReasons: ["x"] }));
    await db.exec(`update radar_listings set source_checked_at = now() - interval '5 days' where id = '${a.id}'`);
    await db.query("select radar_expire()");
    const res = (await asRole(db, "anon", null, () => db.query<{ r: { listings: Array<{ id: string; status: string; live: boolean }> } }>("select radar_get_listings($1::uuid[]) as r", [[a.id, b.id]]))).rows[0]!.r;
    expect(res.listings).toEqual([expect.objectContaining({ id: a.id, status: "expired", live: false })]);
  });

  it("zgłoszenie nieaktualności: zapisuje się, ale z ograniczeniem częstotliwości i bez nadużyć", async () => {
    const a = (await db.query<{ id: string }>("select id from radar_listings where status in ('published', 'expired') limit 1")).rows[0]!.id;
    const call = (reason: string) => asRole(db, "anon", null, async () => (await db.query<{ ok: boolean }>("select radar_report_stale($1, $2) as ok", [a, reason])).rows[0]!.ok);
    expect(await call("Termin się zmienił")).toBe(true);
    expect(await call("x")).toBe(false);
    expect(await call("y".repeat(501))).toBe(false);
    for (let i = 0; i < 4; i++) expect(await call(`zgłoszenie ${i}`)).toBe(true);
    expect(await call("zbyt wiele")).toBe(false); // limit 5 na godzinę
    expect(await asRole(db, "anon", null, async () => (await db.query<{ ok: boolean }>("select radar_report_stale($1, 'ok ok') as ok", ["00000000-0000-0000-0000-000000000000"])).rows[0]!.ok)).toBe(false);
  });
});

describe("blokady, budżet i kolejka", () => {
  it("blokada nie pozwala na równoległe wykonanie, zwalnia się po zakończeniu i po upływie TTL", async () => {
    const lock = async (ttl = 600) => (await db.query<{ r: string | null }>("select radar_try_lock('discover', $1) as r", [ttl])).rows[0]!.r;
    const a = await lock();
    expect(a).not.toBeNull();
    expect(await lock()).toBeNull();
    await db.query("select radar_finish_job($1, 'ok', '{\"n\": 1}'::jsonb, null)", [a]);
    const b = await lock(1);
    expect(b).not.toBeNull();
    await db.exec("update radar_job_locks set locked_until = now() - interval '1 second'"); // zawieszone zadanie po awarii
    expect(await lock()).not.toBeNull();
    const runs = await db.query<{ status: string }>("select status from radar_job_runs where job = 'discover' order by started_at");
    expect(runs.rows.map((x) => x.status)).toContain("skipped");
    expect(runs.rows.map((x) => x.status)).toContain("ok");
    // blokady różnych zadań są niezależne
    expect((await db.query<{ r: string | null }>("select radar_try_lock('refresh', 60) as r")).rows[0]!.r).not.toBeNull();
  });

  it("budżet dzienny przyznaje tylko tyle, ile zostało", async () => {
    const take = async (n: number) => (await db.query<{ g: number }>("select radar_budget_take('brave', $1, 40) as g", [n])).rows[0]!.g;
    expect(await take(25)).toBe(25);
    expect(await take(25)).toBe(15);
    expect(await take(5)).toBe(0);
  });

  it("kolejka: idempotentne dodawanie, pobieranie tylko dla zatwierdzonych źródeł, bez podwójnego pobrania, z ponowieniem po TTL", async () => {
    const cand = (await db.query<{ id: string }>("select radar_upsert_candidate_source('nowa-domena.example', 'https://nowa-domena.example/x', 'Nabór', 'zapytanie') as id")).rows[0]!.id;
    const urls = [{ url: "https://orly.example/n1", hash: "q1" }, { url: "https://orly.example/n2", hash: "q2" }];
    expect((await db.query<{ n: number }>("select radar_enqueue_urls($1, $2::jsonb) as n", [srcId, JSON.stringify(urls)])).rows[0]!.n).toBe(2);
    expect((await db.query<{ n: number }>("select radar_enqueue_urls($1, $2::jsonb) as n", [srcId, JSON.stringify(urls)])).rows[0]!.n).toBe(0);
    await db.query("select radar_enqueue_urls($1, $2::jsonb)", [cand, JSON.stringify([{ url: "https://nowa-domena.example/x", hash: "q3", via: "search" }])]);
    const claim = async (ttl = 900) => (await db.query<{ url: string }>("select * from radar_claim_urls(10, $1)", [ttl])).rows.map((r) => r.url);
    expect((await claim()).sort()).toEqual(["https://orly.example/n1", "https://orly.example/n2"]); // kandydat nie jest pobierany
    expect(await claim()).toEqual([]); // już zajęte
    await db.exec("update radar_urls set claimed_at = now() - interval '2 hours' where state = 'claimed'");
    expect(await claim()).toHaveLength(2); // wygasła rezerwacja → ponowienie
    // adres znanego ogłoszenia nie wraca do kolejki
    await upsert(payload({ urlHash: "q9", url: "https://orly.example/known" }));
    expect((await db.query<{ n: number }>("select radar_enqueue_urls($1, $2::jsonb) as n", [srcId, JSON.stringify([{ url: "https://orly.example/known", hash: "q9" }])])).rows[0]!.n).toBe(0);
  });

  it("kandydat na źródło: ponowne znalezienie zwiększa licznik, ale nie zmienia decyzji administratora", async () => {
    await db.query("select radar_upsert_candidate_source('Nowa-Domena.example', 'https://nowa-domena.example/y', 't', 'q')");
    const r = await db.query<{ status: string; seen_count: number }>("select status, seen_count from radar_sources where domain = 'nowa-domena.example'");
    expect(r.rows[0]).toEqual({ status: "candidate", seen_count: 2 });
    await db.exec("update radar_sources set status = 'rejected' where domain = 'nowa-domena.example'");
    await db.query("select radar_upsert_candidate_source('nowa-domena.example', 'https://nowa-domena.example/z', 't', 'q')");
    expect((await db.query<{ status: string }>("select status from radar_sources where domain = 'nowa-domena.example'")).rows[0]!.status).toBe("rejected");
  });

  it("do odświeżenia trafiają tylko opublikowane oferty z zatwierdzonych źródeł, najdawniej sprawdzane pierwsze", async () => {
    await db.exec("delete from radar_listings");
    const a = await upsert(payload({ urlHash: "h-r1", url: "https://orly.example/r1" }));
    const b = await upsert(payload({ urlHash: "h-r2", url: "https://orly.example/r2" }));
    await db.exec(`update radar_listings set source_checked_at = now() - interval '7 hours' where id = '${a.id}'; update radar_listings set source_checked_at = now() - interval '9 hours' where id = '${b.id}'`);
    const due = await db.query<{ id: string }>("select id from radar_due_listings(10)");
    expect(due.rows.map((x) => x.id)).toEqual([b.id, a.id]);
    await db.exec(`update radar_listings set source_checked_at = now() - interval '1 hour' where id = '${a.id}'`); // sprawdzone niedawno – poza odstępem 6 h
    expect((await db.query("select id from radar_due_listings(10)")).rows).toHaveLength(1);
    await db.exec(`update radar_sources set status = 'suspended' where id = '${srcId}'`);
    expect((await db.query("select id from radar_due_listings(10)")).rows).toHaveLength(0);
    await db.exec(`update radar_sources set status = 'approved' where id = '${srcId}'`);
  });
});

describe("kontrola dostępu i RLS", () => {
  it("anonim i zwykły użytkownik nie widzą tabel radaru, a administrator tak", async () => {
    await upsert(payload({ urlHash: "h-rls", url: "https://orly.example/rls" }));
    for (const t of ["radar_listings", "radar_sources", "radar_sessions", "radar_checks", "radar_job_runs", "radar_settings"]) {
      expect((await asRole(db, "anon", null, () => db.query(`select 1 from ${t}`))).rows, `anon ${t}`).toHaveLength(0);
      expect((await asRole(db, "authenticated", U1, () => db.query(`select 1 from ${t}`))).rows, `user ${t}`).toHaveLength(0);
    }
    expect((await asRole(db, "authenticated", ADMIN, () => db.query("select 1 from radar_sources"))).rows.length).toBeGreaterThan(0);
    expect((await asRole(db, "authenticated", ADMIN, () => db.query("select 1 from radar_listings"))).rows.length).toBeGreaterThan(0);
  });

  it("anonim i użytkownik nie mogą zapisywać do tabel ani wołać funkcji zadań (klucze serwerowe zostają na serwerze)", async () => {
    await expect(asRole(db, "anon", null, () => db.exec("insert into radar_sources (domain) values ('x.example')"))).rejects.toThrow();
    await expect(asRole(db, "authenticated", U1, () => db.exec("update radar_listings set status = 'published'"))).resolves.toBeDefined(); // RLS: 0 wierszy
    expect((await db.query<{ n: number }>("select count(*)::int as n from radar_listings where status = 'published' and url_hash = 'h-rls'")).rows[0]!.n).toBe(1);
    for (const fn of ["radar_upsert_listing('{}'::jsonb)", "radar_expire()", "radar_try_lock('x', 1)", "radar_claim_urls(1, 1)", "radar_budget_take('x', 1, 1)"]) {
      await expect(asRole(db, "anon", null, () => db.query(`select ${fn}`)), `anon ${fn}`).rejects.toThrow(/permission denied/i);
      await expect(asRole(db, "authenticated", U1, () => db.query(`select ${fn}`)), `user ${fn}`).rejects.toThrow(/permission denied/i);
    }
    await expect(asRole(db, "service_role", null, () => db.query("select radar_expire()"))).resolves.toBeDefined();
  });

  it("akcje administratora wymagają roli administratora", async () => {
    const id = (await db.query<{ id: string }>("select id from radar_sources where domain = 'nowa-domena.example'")).rows[0]!.id;
    await expect(asRole(db, "authenticated", U1, () => db.query("select radar_admin_set_source($1, 'approved', 'Zgoda organizatora z 2026-11-18', null::jsonb, null::text[])", [id]))).rejects.toThrow(/brak uprawnień/);
    await expect(asRole(db, "anon", null, () => db.query("select radar_admin_set_source($1, 'approved', 'Zgoda organizatora z 2026-11-18', null::jsonb, null::text[])", [id]))).rejects.toThrow();
    await expect(asRole(db, "authenticated", ADMIN, () => db.query("select radar_admin_set_source($1, 'approved', 'zgoda', null::jsonb, null::text[])", [id]))).rejects.toThrow(/podstawę/);
    await asRole(db, "authenticated", ADMIN, () => db.query(
      "select radar_admin_set_source($1, 'approved', 'Zgoda organizatora z 2026-11-18, e-mail', '{\"fetch\": true, \"publish_facts\": true, \"images\": false}'::jsonb, '{https://nowa-domena.example/feed}')", [id]));
    const r = (await db.query<{ status: string; approved_by: string; license_basis: string }>("select status, approved_by, license_basis from radar_sources where id = $1", [id])).rows[0]!;
    expect(r).toMatchObject({ status: "approved", approved_by: ADMIN });
    expect(r.license_basis).toContain("Zgoda organizatora");
  });

  it("zapisane oferty są izolowane między użytkownikami", async () => {
    const l = (await db.query<{ id: string }>("select id from radar_listings limit 1")).rows[0]!.id;
    await asRole(db, "authenticated", U1, () => db.query("insert into radar_saved (user_id, listing_id) values ($1, $2)", [U1, l]));
    expect((await asRole(db, "authenticated", U1, () => db.query("select 1 from radar_saved"))).rows).toHaveLength(1);
    expect((await asRole(db, "authenticated", U2, () => db.query("select 1 from radar_saved"))).rows).toHaveLength(0);
    await expect(asRole(db, "authenticated", U2, () => db.query("insert into radar_saved (user_id, listing_id) values ($1, $2)", [U1, l]))).rejects.toThrow(/row-level security/);
    await asRole(db, "authenticated", U2, () => db.query("delete from radar_saved")); // cudzych wierszy nie usunie
    expect((await db.query("select 1 from radar_saved")).rows).toHaveLength(1);
    expect((await asRole(db, "anon", null, () => db.query("select 1 from radar_saved"))).rows).toHaveLength(0);
  });
});
