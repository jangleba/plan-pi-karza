import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

export const runtimeMigration = "20261018181225_reconcile_runtime_contracts.sql";
export async function bootstrapSqlDatabase(db: PGlite, before?: string) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 create table storage.buckets(id text primary key,name text,public boolean);
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
  for (const f of migrationFiles())
    if (!before || f < before) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
}
export const migrationFiles = () =>
  readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
