import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { U1, U2, asRole, freshDb } from "../test/pg";

let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => db.query<T>(sql, p);
const as = <T,>(uid: string | null, fn: () => Promise<T>, role: "authenticated" | "anon" | "service_role" = "authenticated") => asRole(db, role, uid, fn);
const phrase = (over: Record<string, unknown> = {}) => JSON.stringify({ stage: 1, due: "2026-11-20", lastDay: "2026-11-19", dayOk: true, seen: 2, correct: 2, wrong: 0, ts: 1700000000000, ...over });
const put = (u: string, item: string, data: string, as_: string | null = u) =>
  as(as_, () => q("insert into english_progress (user_id, item, data) values ($1, $2, $3::jsonb) on conflict (user_id, item) do update set data = excluded.data", [u, item, data]));

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`insert into auth.users (id) values ('${U1}'), ('${U2}')`);
}, 60_000);

describe("english_progress: kontrola dostępu (RLS)", () => {
  it("użytkownik zapisuje i czyta tylko swoje wiersze; cudzych nie widzi, nie podmieni user_id, nie zmieni ani nie usunie", async () => {
    await put(U1, "phrase:partners-01", phrase());
    await put(U1, "level", JSON.stringify({ value: 2, ts: 5 }));
    await put(U2, "phrase:partners-01", phrase({ stage: 4 }));
    expect((await as(U1, () => q("select item from english_progress order by item"))).rows.map((r) => (r as { item: string }).item)).toEqual(["level", "phrase:partners-01"]);
    expect((await as(U2, () => q<{ s: string }>("select data->>'stage' as s from english_progress"))).rows).toEqual([{ s: "4" }]);
    await expect(put(U2, "phrase:coach-01", phrase(), U1)).rejects.toThrow(/row-level security/); // U1 próbuje zapisać wiersz jako U2
    await as(U1, () => q("update english_progress set data = data || '{\"stage\": 5}'::jsonb where user_id = $1", [U2]));
    await as(U1, () => q("delete from english_progress where user_id = $1", [U2]));
    expect((await q<{ s: string }>("select data->>'stage' as s from english_progress where user_id = $1", [U2])).rows).toEqual([{ s: "4" }]);
  });
  it("anonim nie ma dostępu", async () => {
    expect((await as(null, () => q("select * from english_progress"), "anon")).rows).toHaveLength(0);
    await expect(as(null, () => q("insert into english_progress (user_id, item, data) values ($1, 'level', '{\"value\":1,\"ts\":1}')", [U1]), "anon")).rejects.toThrow();
  });
  it("aktualizacja własnego wiersza działa i ustawia updated_at", async () => {
    await put(U1, "phrase:partners-01", phrase({ stage: 2, ts: 1700000001000 }));
    expect((await as(U1, () => q<{ s: string }>("select data->>'stage' as s from english_progress where item = 'phrase:partners-01'"))).rows).toEqual([{ s: "2" }]);
    expect((await q<{ n: number }>("select count(*)::int as n from english_progress where user_id = $1 and updated_at > now() - interval '1 minute'", [U1])).rows[0]!.n).toBeGreaterThan(0);
  });
});

describe("english_progress: walidacja danych", () => {
  const bad = (item: string, data: string, re: RegExp) => expect(put(U1, item, data)).rejects.toThrow(re);
  it("odrzuca nieprawidłowy klucz, brak ts, nieobiekt i zbyt duże dane", async () => {
    await bad("phrase:../x", phrase(), /english_item_format/);
    await bad("phrase:UPPER", phrase(), /english_item_format/);
    await bad("cokolwiek", phrase(), /english_item_format/);
    await bad("phrase:coach-01", JSON.stringify({ stage: 1, due: "2026-11-20", lastDay: "", dayOk: true, seen: 1, correct: 1, wrong: 0 }), /english_data_shape/);
    await bad("phrase:coach-01", "[1,2]", /dane muszą być obiektem/);
    await bad("resume", JSON.stringify({ ts: 1, session: "x".repeat(5000) }), /english_data_shape/);
  });
  it("odrzuca pola spoza kontraktu i nieprawidłowe wartości", async () => {
    await bad("phrase:coach-01", phrase({ pesel: "123" }), /pole spoza kontraktu/);
    await bad("phrase:coach-01", phrase({ stage: 9 }), /nieprawidłowy etap/);
    await bad("phrase:coach-01", phrase({ due: "jutro" }), /nieprawidłowy termin/);
    await bad("level", JSON.stringify({ value: 7, ts: 1 }), /nieprawidłowy poziom/);
    await bad("lesson:partners", JSON.stringify({ completedAt: "wczoraj", completions: 1, firstTry: 1, ts: 1 }), /nieprawidłowa data/);
    await bad("resume", JSON.stringify({ ts: 1 }), /brak sesji/);
  });
  it("przyjmuje poprawne elementy każdego rodzaju (w tym wyczyszczone miejsce przerwania)", async () => {
    await put(U1, "level", JSON.stringify({ value: 3, ts: 9 }));
    await put(U1, "lesson:partners", JSON.stringify({ completedAt: "2026-11-19", completions: 1, firstTry: 0.9, ts: 9 }));
    await put(U1, "resume", JSON.stringify({ ts: 9, session: null }));
    await put(U1, "phrase:coach-02", phrase({ lastDay: "" }));
    await put(U1, "card:w-01", phrase());
    await bad("card:w-01", phrase({ stage: 7 }), /nieprawidłowy etap/); // fiszki mają ten sam kontrakt co zwroty
    await bad("card:w-01", phrase({ extra: 1 }), /pole spoza kontraktu/);
  });
  it("limit liczby elementów na użytkownika", async () => {
    await db.exec("alter table english_progress disable trigger english_progress_guard");
    await db.exec(`insert into english_progress (user_id, item, data) select '${U2}', 'phrase:x-' || g, '{"ts":1}'::jsonb from generate_series(1, 399) g on conflict do nothing`);
    await db.exec("alter table english_progress enable trigger english_progress_guard");
    await expect(put(U2, "phrase:over-1", phrase())).rejects.toThrow(/za dużo elementów/);
    await db.exec(`delete from english_progress where user_id = '${U2}' and item like 'phrase:x-%'`);
  });
});

describe("english_progress: eksport i usunięcie konta", () => {
  it("eksport zawiera tylko postęp zalogowanego użytkownika", async () => {
    const e = (await as(U1, () => q<{ e: { englishProgress: Array<{ item: string; data: { ts: number } }> } }>("select export_my_data() as e"))).rows[0]!.e;
    expect(e.englishProgress.map((x) => x.item)).toEqual(["card:w-01", "lesson:partners", "level", "phrase:coach-02", "phrase:partners-01", "resume"]);
    expect(JSON.stringify(e.englishProgress)).not.toContain(U2);
  });
  it("usunięcie konta kasuje postęp tego użytkownika i nie rusza cudzego", async () => {
    await put(U2, "phrase:partners-01", phrase());
    const r = (await as(null, () => q<{ r: { deleted: Record<string, number> } }>("select erase_user_data($1) as r", [U1]), "service_role")).rows[0]!.r;
    expect(r.deleted.english_progress).toBe(6);
    expect((await q("select 1 from english_progress where user_id = $1", [U1])).rows).toHaveLength(0);
    expect((await q("select 1 from english_progress where user_id = $1", [U2])).rows.length).toBeGreaterThan(0);
  });
  it("usunięcie użytkownika w auth.users kasuje kaskadowo jego postęp", async () => {
    await db.exec(`delete from auth.users where id = '${U2}'`);
    expect((await q("select 1 from english_progress")).rows).toHaveLength(0);
  });
});
