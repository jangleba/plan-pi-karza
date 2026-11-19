import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { ADMIN, U1, asRole, freshDb } from "./pg.ts";

let db: PGlite;
const jobs = async () => (await db.query<{ jobname: string; schedule: string; command: string }>("select jobname, schedule, command from cron.job order by jobname")).rows;
const register = async () => (await db.query<{ r: Record<string, unknown> }>("select radar_register_schedules() as r")).rows[0]!.r;

beforeEach(async () => {
  db = await freshDb(["0003_radar_schedules.sql"]);
  await db.exec(`insert into auth.users (id) values ('${U1}'), ('${ADMIN}'); insert into radar_admins (user_id) values ('${ADMIN}')`);
  await db.exec("delete from cron.job"); // migracja zarejestrowała już samo wygaszanie (brak sekretów)
}, 60_000);

describe("rejestracja harmonogramów", () => {
  it("migracja bez sekretów Vault nie przerywa się i rejestruje tylko wygaszanie; wyraźnie wskazuje braki", async () => {
    const fresh = await freshDb(["0003_radar_schedules.sql"]);
    const r = (await fresh.query<{ jobname: string; schedule: string }>("select jobname, schedule from cron.job")).rows;
    expect(r).toEqual([{ jobname: "radar-expire", schedule: "*/15 * * * *" }]);
    const out = await fresh.query<{ r: { refresh: unknown; missingVault: Array<string | null> } }>("select radar_register_schedules() as r");
    expect(out.rows[0]!.r.refresh).toBeNull();
    expect(out.rows[0]!.r.missingVault.filter(Boolean).sort()).toEqual(["radar_cron_secret", "radar_project_url"]);
  });

  it("interwały z ustawień dają poprawne wyrażenia; nieobsługiwane są odrzucane", async () => {
    const e = async (m: number) => (await db.query<{ e: string }>("select radar_cron_expr($1) as e", [m])).rows[0]!.e;
    expect(await Promise.all([15, 30, 60, 360, 720, 1440].map(e))).toEqual(["*/15 * * * *", "*/30 * * * *", "0 */1 * * *", "0 */6 * * *", "0 */12 * * *", "0 0 * * *"]);
    for (const bad of [7, 0, 90, 600, 2000]) await expect(db.query("select radar_cron_expr($1)", [bad])).rejects.toThrow(/nieobsługiwany interwał/);
  });

  it("z sekretami rejestruje trzy zadania o domyślnych interwałach 15 min / 6 h / 12 h", async () => {
    await db.exec("select vault.create_secret('https://abc.supabase.co', 'radar_project_url'); select vault.create_secret('sekret-cron-123', 'radar_cron_secret')");
    const r = await register();
    expect(r).toEqual({ expire: "*/15 * * * *", refresh: "0 */6 * * *", discover: "0 */12 * * *" });
    expect((await jobs()).map((j) => [j.jobname, j.schedule])).toEqual([["radar-discover", "0 */12 * * *"], ["radar-expire", "*/15 * * * *"], ["radar-refresh", "0 */6 * * *"]]);
  });

  it("jest idempotentna i stosuje zmienione interwały bez dublowania zadań", async () => {
    await db.exec("select vault.create_secret('https://abc.supabase.co', 'radar_project_url'); select vault.create_secret('sekret-cron-123', 'radar_cron_secret')");
    await register(); await register(); await register();
    expect(await jobs()).toHaveLength(3);
    await db.exec("update radar_settings set value = '4' where key = 'refresh_interval_hours'; update radar_settings set value = '30' where key = 'expire_interval_minutes'");
    await register();
    const j = await jobs();
    expect(j).toHaveLength(3);
    expect(j.find((x) => x.jobname === "radar-refresh")!.schedule).toBe("0 */4 * * *");
    expect(j.find((x) => x.jobname === "radar-expire")!.schedule).toBe("*/30 * * * *");
  });

  it("zadania HTTP wołają właściwe funkcje z sekretem z Vault, a sekret nie jest zapisany w tabeli zadań", async () => {
    await db.exec("select vault.create_secret('https://abc.supabase.co', 'radar_project_url'); select vault.create_secret('sekret-cron-123', 'radar_cron_secret')");
    await register();
    for (const j of await jobs()) {
      expect(j.command).not.toContain("sekret-cron-123");
      expect(j.command).not.toContain("abc.supabase.co");
    }
    for (const j of await jobs()) await db.exec(j.command); // „uruchomienie” zadań
    const reqs = (await db.query<{ url: string; headers: Record<string, string>; timeout_ms: number }>("select url, headers, timeout_ms from net.requests order by url")).rows;
    expect(reqs.map((r) => r.url)).toEqual(["https://abc.supabase.co/functions/v1/radar-discover", "https://abc.supabase.co/functions/v1/radar-refresh"]);
    for (const r of reqs) { expect(r.headers["x-radar-secret"]).toBe("sekret-cron-123"); expect(r.timeout_ms).toBe(120000); }
    // zadanie wygaszania zostało wykonane i zapisało przebieg
    expect((await db.query<{ status: string }>("select status from radar_job_runs where job = 'expire'")).rows).toEqual([{ status: "ok" }]);
  });

  it("wyrejestrowanie usuwa zadania; funkcje rejestracji są niedostępne dla użytkowników", async () => {
    await db.exec("select vault.create_secret('https://abc.supabase.co', 'radar_project_url'); select vault.create_secret('sekret-cron-123', 'radar_cron_secret')");
    await register();
    await db.exec("select radar_unschedule()");
    expect(await jobs()).toEqual([]);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(asRole(db, role, U1, () => db.query("select radar_register_schedules()"))).rejects.toThrow(/permission denied/i);
      await expect(asRole(db, role, U1, () => db.query("select radar_unschedule()"))).rejects.toThrow(/permission denied/i);
    }
  });

  it("stan harmonogramów widzi tylko administrator", async () => {
    await db.exec("select vault.create_secret('https://abc.supabase.co', 'radar_project_url'); select vault.create_secret('sekret-cron-123', 'radar_cron_secret')");
    await register();
    await expect(asRole(db, "authenticated", U1, () => db.query("select radar_schedule_status()"))).rejects.toThrow(/brak uprawnień/);
    const st = (await asRole(db, "authenticated", ADMIN, () => db.query<{ s: Array<{ name: string; active: boolean }> }>("select radar_schedule_status() as s"))).rows[0]!.s;
    expect(st.map((x) => x.name).sort()).toEqual(["radar-discover", "radar-expire", "radar-refresh"]);
  });
});
