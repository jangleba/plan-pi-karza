import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { ADMIN, U1, asRole, freshDb } from "./pg";

const mig = (n: string) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");

describe("migracja 0007: usunięcie radaru", () => {
  it("po wszystkich migracjach w bazie nie ma żadnych tabel ani funkcji radaru, a narzędzia prywatności działają z ogólną rolą administratora", async () => {
    const db = await freshDb();
    const left = await db.query<{ n: string }>(`select 'table:' || tablename as n from pg_tables where schemaname = 'public' and tablename like 'radar\\_%'
      union all select 'fn:' || proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and proname like 'radar\\_%'`);
    expect(left.rows).toEqual([]);
    await db.exec(`insert into auth.users (id) values ('${U1}'), ('${ADMIN}'); insert into app_admins (user_id) values ('${ADMIN}')`);
    const audit = await asRole(db, "authenticated", ADMIN, () => db.query("select profiles_birth_audit() as a"));
    expect(audit.rows).toHaveLength(1);
    await expect(asRole(db, "authenticated", U1, () => db.query("select profiles_birth_audit()"))).rejects.toThrow(/brak uprawnień/);
  });

  it("migracja na bazie, w której radar był wdrożony z harmonogramem pg_cron: zadania są wyłączone, a dane radaru usunięte", async () => {
    const db: PGlite = await freshDb({ upTo: "0007", withSchedules: true }); // 0001–0006 z atrapami pg_cron/pg_net/Vault
    await db.exec("select vault.create_secret('https://x.supabase.co', 'radar_project_url'); select vault.create_secret('sekret-sekret-sekret-1234', 'radar_cron_secret')");
    await db.exec("select public.radar_register_schedules()");
    expect((await db.query<{ jobname: string }>("select jobname from cron.job where jobname like 'radar-%' order by 1")).rows.map((r) => r.jobname)).toEqual(["radar-discover", "radar-expire", "radar-refresh"]);
    await db.exec(mig("0007_remove_radar.sql"));
    expect((await db.query("select jobname from cron.job where jobname like 'radar-%'")).rows).toEqual([]);
    expect((await db.query(`select tablename from pg_tables where schemaname = 'public' and tablename like 'radar\\_%'`)).rows).toEqual([]);
    expect((await db.query(`select proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and proname like 'radar\\_%'`)).rows).toEqual([]);
  });

  it("administratorzy radaru są przenoszeni do ogólnej tabeli (ponowne uruchomienie migracji nic nie psuje)", async () => {
    // baza przed 0007: stosujemy 0001–0006 ręcznie, dodajemy administratora radaru i dopiero wtedy 0007
    const base = await freshDb();
    const raw = new PGlite();
    await raw.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    for (const f of ["0001_init.sql", "0002_radar.sql", "0004_radar_clubs.sql", "0005_privacy_account.sql", "0006_radar_confirmation.sql"]) await raw.exec(mig(f));
    await raw.exec(`insert into auth.users (id) values ('${ADMIN}'); insert into radar_admins (user_id) values ('${ADMIN}')`);
    await raw.exec(mig("0007_remove_radar.sql"));
    expect((await raw.query("select user_id from app_admins")).rows).toEqual([{ user_id: ADMIN }]);
    await raw.exec(mig("0007_remove_radar.sql")); // idempotentność
    expect((await raw.query("select count(*)::int as n from app_admins")).rows).toEqual([{ n: 1 }]);
    void base;
  });
});
