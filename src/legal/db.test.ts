import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { ADMIN, U1, U2, asRole, freshDb } from "../test/pg";

let db: PGlite;
const GUARD = "00000000-0000-0000-0000-0000000000a1"; // opiekun (osobne konto)
const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => db.query<T>(sql, p);
const as = <T,>(uid: string | null, fn: () => Promise<T>, role: "authenticated" | "anon" | "service_role" = "authenticated") => asRole(db, role, uid, fn);
const profile = (over: Record<string, unknown> = {}) => JSON.stringify({ name: "A", age: 17, ageAsOf: "2026-11-19", strengthYears: 1, weightKg: 70, position: "pomocnik", equipment: ["gym"], clubWeekdays: [1], matchWeekdays: [5], limitedGymAccess: false, ...over });

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`insert into auth.users (id) values ('${U1}'), ('${U2}'), ('${ADMIN}'), ('${GUARD}'); insert into app_admins (user_id) values ('${ADMIN}')`);
}, 60_000);

describe("kontrakt profilu na serwerze: wiek i brak daty urodzenia", () => {
  it("odrzuca datę urodzenia, rocznik, pola spoza kontraktu i wiek poniżej 16 lat; przyjmuje poprawny profil", async () => {
    const put = (data: string) => as(U1, () => q("insert into profiles (user_id, data) values ($1, $2::jsonb) on conflict (user_id) do update set data = excluded.data", [U1, data]));
    await expect(put(profile({ birthDate: "2009-05-10" }))).rejects.toThrow(/data urodzenia zostaje na urządzeniu/);
    await expect(put(profile({ birthYear: 2009 }))).rejects.toThrow(/birthYear/);
    await expect(put(profile({ dob: "x" }))).rejects.toThrow();
    await expect(put(profile({ pesel: "123" }))).rejects.toThrow(/poza kontraktem/);
    await expect(put(profile({ age: 15 }))).rejects.toThrow(/poniżej 16/);
    await expect(put(profile({ age: "17" }))).rejects.toThrow();
    await expect(put(profile({ age: 17.5 }))).rejects.toThrow();
    await put(profile());
    expect((await q("select 1 from profiles where user_id = $1", [U1])).rows).toHaveLength(1);
    await expect(as(U1, () => q("update profiles set data = data || '{\"birthDate\":\"2009-01-01\"}'::jsonb where user_id = $1", [U1]))).rejects.toThrow(/data urodzenia/);
  });

  it("bezpieczne porządkowanie istniejących zapisów: audyt → dry-run → dopiero potem zmiana; tylko administrator", async () => {
    await db.exec("alter table profiles disable trigger profiles_contract");
    await q("insert into profiles (user_id, data) values ($1, $2::jsonb) on conflict (user_id) do update set data = excluded.data", [U2, profile({ birthDate: "2001-02-03", age: 25 })]);
    await db.exec("alter table profiles enable trigger profiles_contract");
    await expect(as(U1, () => q("select profiles_birth_audit()"))).rejects.toThrow(/brak uprawnień/);
    const audit = (await as(ADMIN, () => q<{ a: { withBirthFields: number } }>("select profiles_birth_audit() as a"))).rows[0]!.a;
    expect(audit.withBirthFields).toBe(1);
    const dry = (await as(ADMIN, () => q<{ r: { dryRun: boolean; wouldUpdate: number } }>("select strip_profile_birth_fields() as r"))).rows[0]!.r;
    expect(dry).toMatchObject({ dryRun: true, wouldUpdate: 1 });
    expect((await q<{ n: number }>("select count(*)::int as n from profiles where data ? 'birthDate'")).rows[0]!.n).toBe(1); // dry-run niczego nie zmienił
    const real = (await as(ADMIN, () => q<{ r: { updated: number } }>("select strip_profile_birth_fields(false) as r"))).rows[0]!.r;
    expect(real.updated).toBe(1);
    expect((await q<{ n: number }>("select count(*)::int as n from profiles where data ? 'birthDate'")).rows[0]!.n).toBe(0);
    expect((await q<{ a: number }>("select (data->>'age')::int as a from profiles where user_id = $1", [U2])).rows[0]!.a).toBe(25); // reszta zapisu nietknięta
  });
});

describe("dowody oświadczeń: osobne akceptacje i zgody, dziennik tylko do dopisywania", () => {
  it("akceptacja umowy i potwierdzenie zasad bezpieczeństwa to osobne zdarzenia z wersją, czasem i metodą", async () => {
    await as(U1, () => q("select record_agreement('terms', 'szkic-0.1')"));
    await as(U1, () => q("select record_agreement('safety', 'szkic-0.1')"));
    const rows = (await as(U1, () => q<{ kind: string; doc_version: string; method: string; recorded_at: string }>("select kind, doc_version, method, recorded_at from agreement_events order by kind"))).rows;
    expect(rows.map((r) => [r.kind, r.doc_version, r.method])).toEqual([["safety", "szkic-0.1", "checkbox"], ["terms", "szkic-0.1", "checkbox"]]);
    expect(rows.every((r) => !!r.recorded_at)).toBe(true);
    await expect(as(U1, () => q("select record_agreement('rodo_ogolna', 'x')"))).rejects.toThrow(); // brak ogólnej zgody „na RODO”
    await expect(as(U1, () => q("select record_agreement('terms', '')"))).rejects.toThrow();
  });
  it("dziennik jest tylko do dopisywania: użytkownik nie edytuje ani nie usuwa dowodów, nie zapisze cudzych", async () => {
    await as(U1, () => q("update agreement_events set doc_version = 'x'"));
    await as(U1, () => q("delete from agreement_events"));
    expect((await q<{ n: number }>("select count(*)::int as n from agreement_events where user_id = $1", [U1])).rows[0]!.n).toBe(2);
    expect((await q<{ n: number }>("select count(*)::int as n from agreement_events where doc_version = 'x'")).rows[0]!.n).toBe(0);
    await expect(as(U2, () => q("insert into agreement_events (user_id, kind, doc_version) values ($1, 'terms', 'v')", [U1]))).rejects.toThrow(/row-level security/);
    expect((await as(U2, () => q("select 1 from agreement_events"))).rows).toHaveLength(0); // izolacja
  });
  it("deklaracja grupy wieku: tylko 16-17 albo 18+ (poniżej 16 nic nie przyjmujemy), bez daty urodzenia", async () => {
    await expect(as(U1, () => q("select declare_age_band('15-16')"))).rejects.toThrow();
    await expect(as(U1, () => q("select declare_age_band('under16')"))).rejects.toThrow();
    await as(U1, () => q("select declare_age_band('16-17')"));
    await as(U2, () => q("select declare_age_band('18+')"));
    expect((await as(U1, () => q<{ b: string }>("select current_age_band() as b"))).rows[0]!.b).toBe("16-17");
    const cols = (await q<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'age_declarations'")).rows.map((c) => c.column_name);
    expect(cols.some((c) => /birth|dob|date_of/.test(c))).toBe(false);
  });
});

describe("zgoda na synchronizację danych zdrowotnych: egzekwowana przez RLS, wycofanie ma skutek", () => {
  const ci = (u: string) => as(u, () => q("insert into check_ins (user_id, day, recovery, feeling) values ($1, '2026-11-19', 2, 3)", [u]));
  it("bez zgody zapis do chmury jest niemożliwy; po zgodzie działa; wycofanie usuwa dane i znów blokuje zapis", async () => {
    await expect(ci(U1)).rejects.toThrow(/row-level security/);
    await expect(as(U1, () => q("insert into weight_log (user_id, exercise_id, kg, reps, logged_on) values ($1, 'sq', 80, 5, '2026-11-19')", [U1]))).rejects.toThrow(/row-level security/);
    await expect(as(U1, () => q("insert into mas_tests (user_id, distance_m) values ($1, 1200)", [U1]))).rejects.toThrow(/row-level security/);
    await as(U1, () => q("select record_consent('health_sync', 'grant', 'szkic-0.1')"));
    expect((await as(U1, () => q<{ c: boolean }>("select has_consent('health_sync') as c"))).rows[0]!.c).toBe(true);
    await ci(U1);
    await as(U1, () => q("insert into weight_log (user_id, exercise_id, kg, reps, logged_on) values ($1, 'sq', 80, 5, '2026-11-19')", [U1]));
    await as(U1, () => q("insert into mas_tests (user_id, distance_m) values ($1, 1200)", [U1]));
    expect((await as(U1, () => q("select 1 from check_ins"))).rows).toHaveLength(1);
    await as(U1, () => q("select record_consent('health_sync', 'withdraw', 'szkic-0.1')"));
    expect((await as(U1, () => q<{ c: boolean }>("select has_consent('health_sync') as c"))).rows[0]!.c).toBe(false);
    for (const t of ["check_ins", "weight_log", "mas_tests"]) expect((await q(`select 1 from ${t} where user_id = $1`, [U1])).rows, t).toHaveLength(0); // skutek wycofania
    await expect(ci(U1)).rejects.toThrow(/row-level security/);
    expect((await as(U1, () => q("select 1 from consent_events"))).rows).toHaveLength(2); // pełna historia zdarzeń zostaje
  });
  it("zgoda jednego użytkownika nie otwiera zapisu innemu; cudze dane są niewidoczne", async () => {
    await expect(ci(U2)).rejects.toThrow(/row-level security/);
    await as(U2, () => q("select record_consent('health_sync', 'grant', 'v')"));
    await ci(U2);
    expect((await as(U1, () => q("select 1 from check_ins"))).rows).toHaveLength(0);
    await expect(as(U2, () => q("insert into check_ins (user_id, day, recovery, feeling) values ($1, '2026-11-20', 1, 1)", [U1]))).rejects.toThrow(/row-level security/);
  });
});

describe("potwierdzenie opiekuna dla 16–17 lat", () => {
  const tok = async (): Promise<{ token: string; expiresAt: string }> => (await as(U1, () => q<{ r: { token: string; expiresAt: string } }>("select request_guardian_confirmation('szkic-0.1') as r"))).rows[0]!.r;
  const state = async () => (await as(U1, () => q<{ s: { state: string } }>("select guardian_state('szkic-0.1') as s"))).rows[0]!.s.state;
  const confirm = (t: string, who: string | null, v = "szkic-0.1", att = true) => as(who, () => q<{ r: { confirmed: boolean; revokeToken: string } }>("select guardian_confirm($1, $2, $3) as r", [t, v, att]), who ? "authenticated" : "anon");

  it("prośba wymaga grupy 16-17; token jest losowy, jednorazowy, wygasający i zapisany tylko jako skrót", async () => {
    await expect(as(U2, () => q("select request_guardian_confirmation('szkic-0.1')"))).rejects.toThrow(/nie jest wymagane/); // dorosły
    expect(await state()).toBe("none");
    const t = await tok();
    expect(t.token).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(t.expiresAt).getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
    expect(new Date(t.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(72 * 3_600_000 + 5000);
    const stored = (await q<{ token_hash: string }>("select token_hash from guardian_confirmations where status = 'pending'")).rows[0]!.token_hash;
    expect(stored).not.toContain(t.token);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(await state()).toBe("pending");
    const t2 = await tok(); // nowa prośba unieważnia poprzednią
    expect((await confirm(t.token, null).catch((e: Error) => e.message)) as unknown).toMatch(/już wykorzystany lub unieważniony/);
    expect(t2.token).not.toBe(t.token);
  });

  it("dziecko nie może samo zatwierdzić (ani przez RLS, ani przez funkcję); opiekun potwierdza po tokenie, tylko z oświadczeniem i właściwą wersją", async () => {
    const t = await tok();
    await expect(confirm(t.token, U1)).rejects.toThrow(/nie może sama jej potwierdzić/);
    expect(await state()).toBe("pending");
    await as(U1, () => q("update guardian_confirmations set status = 'confirmed'")); // brak polityki UPDATE
    expect(await state()).toBe("pending");
    expect((await as(U1, () => q("select 1 from guardian_confirmations"))).rows).toHaveLength(0); // hashe niewidoczne
    await expect(confirm(t.token, null, "szkic-0.1", false)).rejects.toThrow(/oświadczenie opiekuna/);
    await expect(confirm(t.token, null, "inna-wersja")).rejects.toThrow(/inna wersja/);
    await expect(confirm("zly-token", null)).rejects.toThrow(/nieprawidłowy token/);
    const ok = (await confirm(t.token, GUARD)).rows[0]!.r;
    expect(ok.confirmed).toBe(true);
    expect(ok.revokeToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await state()).toBe("confirmed");
    await expect(confirm(t.token, null)).rejects.toThrow(/już wykorzystany/); // brak ponownego użycia
  });

  it("opiekun cofa potwierdzenie osobnym tokenem; stan revoked", async () => {
    const t = await tok();
    const { revokeToken } = (await confirm(t.token, null)).rows[0]!.r;
    expect(await state()).toBe("confirmed");
    const bad = (await as(null, () => q<{ r: boolean }>("select guardian_revoke('zly') as r"), "anon")).rows[0]!.r;
    expect(bad).toBe(false);
    expect((await as(null, () => q<{ r: boolean }>("select guardian_revoke($1) as r", [revokeToken]), "anon")).rows[0]!.r).toBe(true);
    expect(await state()).toBe("revoked");
    expect((await as(null, () => q<{ r: boolean }>("select guardian_revoke($1) as r", [revokeToken]), "anon")).rows[0]!.r).toBe(false);
  });

  it("wygaśnięcie tokenu: po czasie nie można potwierdzić, stan „expired”; info dla opiekuna nie ujawnia danych o osobie", async () => {
    const t = await tok();
    const info = (await as(null, () => q<{ i: Record<string, unknown> }>("select guardian_info($1) as i", [t.token]), "anon")).rows[0]!.i;
    expect(info).toMatchObject({ valid: true, contractVersion: "szkic-0.1" });
    expect(Object.keys(info).sort()).toEqual(["contractVersion", "expiresAt", "valid"]); // brak identyfikatora/imienia
    await db.exec("update guardian_confirmations set expires_at = now() - interval '1 minute' where status = 'pending'");
    await expect(confirm(t.token, null)).rejects.toThrow(/token wygasł/);
    expect(await state()).toBe("expired");
    expect((await as(null, () => q<{ i: { valid: boolean } }>("select guardian_info($1) as i", [t.token]), "anon")).rows[0]!.i.valid).toBe(false);
    expect((await as(null, () => q<{ i: { valid: boolean } }>("select guardian_info('nie-istnieje') as i"), "anon")).rows[0]!.i.valid).toBe(false);
  });
});

describe("brak płatnej aktywacji bez wymaganego potwierdzenia", () => {
  const act = (u: string, v = "szkic-0.1") => as(null, () => q("select activate_paid_access($1, 'pro', $2, 'prov-1')", [u, v]), "service_role");
  it("niepełnoletni bez potwierdzenia opiekuna, bez akceptacji umowy albo bez deklaracji wieku: odmowa", async () => {
    await expect(act(ADMIN)).rejects.toThrow(/age_declaration_required/);
    await db.exec(`select 1`); // U1: ma akceptację umowy i grupę 16-17, a potwierdzenie opiekuna jest cofnięte/wygasłe
    await expect(act(U1)).rejects.toThrow(/guardian_confirmation_required/);
    await expect(act(U1, "inna-wersja")).rejects.toThrow(/terms_not_accepted/);
    expect((await q("select 1 from paid_access where user_id = $1", [U1])).rows).toHaveLength(0);
  });
  it("niepełnoletni z potwierdzeniem opiekuna (właściwa wersja) oraz dorosły z akceptacją: dostęp aktywowany", async () => {
    const t = (await as(U1, () => q<{ r: { token: string } }>("select request_guardian_confirmation('szkic-0.1') as r"))).rows[0]!.r.token;
    await as(null, () => q("select guardian_confirm($1, 'szkic-0.1', true)", [t]), "anon");
    await act(U1);
    expect((await q<{ s: string }>("select status as s from paid_access where user_id = $1", [U1])).rows[0]!.s).toBe("active");
    await as(U2, () => q("select record_agreement('terms', 'szkic-0.1')"));
    await act(U2); // dorosły nie wymaga opiekuna
    expect((await as(U2, () => q("select 1 from paid_access"))).rows).toHaveLength(1);
  });
  it("użytkownik ani anonim nie aktywują dostępu sami, a cudzych zapisów nie widzą", async () => {
    await expect(as(U1, () => q("select activate_paid_access($1, 'pro', 'szkic-0.1', 'x')", [U1]))).rejects.toThrow(/permission denied/i);
    await expect(as(null, () => q("select activate_paid_access($1, 'pro', 'szkic-0.1', 'x')", [U1]), "anon")).rejects.toThrow(/permission denied/i);
    await expect(as(U1, () => q("insert into paid_access (user_id, plan, contract_version) values ($1, 'pro', 'v')", [U2]))).rejects.toThrow(/row-level security/);
    expect((await as(U1, () => q("select 1 from paid_access"))).rows).toHaveLength(1);
  });
});

describe("eksport i usuwanie", () => {
  it("eksport zawiera wszystkie magazyny TYLKO zalogowanego użytkownika i nie zawiera skrótów tokenów", async () => {
    await q("insert into profiles (user_id, data) values ($1, $2::jsonb) on conflict (user_id) do update set data = excluded.data", [U1, profile()]);
    const e = (await as(U1, () => q<{ e: Record<string, unknown> }>("select export_my_data() as e"))).rows[0]!.e;
    expect(Object.keys(e).sort()).toEqual(["ageDeclarations", "agreements", "checkIns", "consents", "englishProgress", "exportedAt", "guardianConfirmations", "masTests", "paidAccess", "profile", "weightLog"]);
    expect((e.agreements as unknown[]).length).toBeGreaterThanOrEqual(2);
    expect((e.consents as unknown[]).length).toBe(2);
    expect(JSON.stringify(e)).not.toMatch(/token_hash|revoke_token|user_id|[0-9a-f]{64}/);
    expect(JSON.stringify(e)).not.toContain(U2);
    await expect(as(null, () => q("select export_my_data()"), "anon")).rejects.toThrow(/permission denied/i);
  });

  it("usunięcie obejmuje wszystkie magazyny użytkownika, nie rusza cudzych, jest idempotentne i zostawia log bez danych osobowych", async () => {
    const tables = ["english_progress", "paid_access", "guardian_confirmations", "consent_events", "agreement_events", "age_declarations", "check_ins", "weight_log", "mas_tests", "profiles"];
    const count = async (u: string) => (await q<{ n: number }>(tables.map((t) => `select count(*)::int as n from ${t} where user_id = '${u}'`).join(" union all "))).rows.reduce((s, r) => s + r.n, 0);
    const u2Before = await count(U2);
    expect(await count(U1)).toBeGreaterThan(5);
    await expect(as(U1, () => q("select erase_user_data($1)", [U1]))).rejects.toThrow(/permission denied/i);
    const r = (await as(null, () => q<{ r: { logId: string; deleted: Record<string, number> } }>("select erase_user_data($1) as r", [U1]), "service_role")).rows[0]!.r;
    expect(Object.keys(r.deleted).sort()).toEqual([...tables].sort());
    expect(await count(U1)).toBe(0);
    expect(await count(U2)).toBe(u2Before); // dane innej osoby nietknięte
    const again = (await as(null, () => q<{ r: { deleted: Record<string, number> } }>("select erase_user_data($1) as r", [U1]), "service_role")).rows[0]!.r;
    expect(Object.values(again.deleted).every((n) => n === 0)).toBe(true); // ponowienie nic nie psuje
    const log = (await q<{ user_hash: string; status: string }>("select user_hash, status from account_deletion_log order by requested_at")).rows;
    expect(log.every((l) => /^[0-9a-f]{64}$/.test(l.user_hash) && l.user_hash !== U1)).toBe(true);
    await as(null, () => q("select finish_account_deletion($1, true)", [r.logId]), "service_role");
    expect((await q<{ status: string }>("select status from account_deletion_log where id = $1", [r.logId])).rows[0]!.status).toBe("completed");
    expect((await as(U2, () => q("select 1 from account_deletion_log"))).rows).toHaveLength(0); // log tylko dla administratora
  });
});
