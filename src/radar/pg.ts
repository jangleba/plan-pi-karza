import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

/** Baza testowa: prawdziwy Postgres (PGlite) z atrapami elementów Supabase (auth, role). */
const STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const file = (n: string) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");

/** Atrapy rozszerzeń Supabase (pg_cron, pg_net, Vault) – sprawdzamy NASZ SQL rejestracji i wykonania zadań, nie sam pg_cron. */
const CRON_STUBS = `
  create schema extensions; create schema cron; create schema net; create schema vault;
  create table cron.job (jobid bigserial primary key, jobname text unique, schedule text not null, command text not null, active boolean not null default true);
  create table cron.job_run_details (jobid bigint, start_time timestamptz default now(), status text default 'succeeded');
  create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as
    $$ insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
       on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
  create function cron.unschedule(p_name text) returns boolean language sql as $$ delete from cron.job where jobname = p_name returning true $$;
  create table net.requests (id bigserial primary key, url text, headers jsonb, body jsonb, timeout_ms integer);
  create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language sql as
    $$ insert into net.requests (url, headers, body, timeout_ms) values (url, headers, body, timeout_milliseconds) returning id $$;
  create table vault.secrets (name text primary key, secret text not null);
  create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(p_secret text, p_name text) returns text language sql as $$ insert into vault.secrets values (p_name, p_secret) returning p_name $$;
`;

export async function freshDb(extra: string[] = []): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUBS);
  if (extra.length) await db.exec(CRON_STUBS);
  await db.exec(file("0001_init.sql"));
  await db.exec(file("0002_radar.sql"));
  await db.exec(file("0004_radar_clubs.sql"));
  await db.exec(file("0005_privacy_account.sql"));
  await db.exec(file("0006_radar_confirmation.sql"));
  for (const f of extra) await db.exec(file(f).replace(/create extension if not exists \w+;/g, ""));
  // domyślnie funkcje/tabele w public mają uprawnienia właściciela; nadajemy jak w Supabase (RLS i tak pilnuje dostępu)
  await db.exec("grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role");
  return db;
}

export async function asRole<T>(db: PGlite, role: "anon" | "authenticated" | "service_role", uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
  try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); }
}

export const U1 = "11111111-1111-1111-1111-111111111111";
export const U2 = "22222222-2222-2222-2222-222222222222";
export const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
