#!/bin/bash
# Uruchamia migracje 0001–0010 na czystej bazie z atrapami Supabase (auth, role) i testy SQL. Wymaga psql i działającego Postgresa.
# Użycie: PGHOST=/tmp/pgsock PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=bw_test_$$
psql -q -c "create database $DB" >/dev/null
trap 'psql -q -c "drop database if exists $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
SQL
for f in 0001_init 0002_radar 0004_radar_clubs 0005_privacy_account 0006_radar_confirmation 0007_remove_radar 0008_english_progress 0009_check_in_recovery 0010_pwa_roles_sync; do
  sed -E 's/create extension if not exists [a-z_]+;//g' "supabase/migrations/$f.sql" | psql -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null
done
psql -q -d "$DB" -c "grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/0010_pwa_roles_sync.test.sql 2>&1 | sed -n 's/^.*NOTICE:  //p; /ZALICZONE/p; /ERROR/p'
