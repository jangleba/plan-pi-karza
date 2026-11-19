-- Usunięcie modułu „Piłkarskie szanse” (radar) z bazy.
--
-- Migracje 0002–0004 i 0006 zostają w repozytorium bez zmian: jeśli były zastosowane na prawdziwym projekcie, Supabase CLI wymaga
-- ich obecności w historii (`supabase db push`). Ta migracja dopiero usuwa ich skutki. NIEODWRACALNE: kasuje tabele radaru
-- razem z danymi (źródła, oferty, kluby, adresy kontaktowe, zapisane oferty użytkowników, zgłoszenia). Zrób kopię zapasową.
--
-- Czego NIE robi (wymaga ręcznego kroku w panelu Supabase, patrz docs/AUDYT-STATUS.md):
--   * nie usuwa wdrożonych funkcji Edge `radar-discover` i `radar-refresh` (supabase functions delete …),
--   * nie usuwa sekretów Vault (`radar_project_url`, `radar_cron_secret`) ani sekretów funkcji (RADAR_CRON_SECRET, BRAVE_SEARCH_API_KEY, ANTHROPIC_API_KEY),
--   * nie wyłącza rozszerzeń pg_cron i pg_net (mogą służyć innym zadaniom).

-- 1. Ogólna rola administratora (dotąd tabela radar_admins służyła także do kontroli dostępu do narzędzi prywatności).
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
drop policy if exists "own admin row" on public.app_admins;
create policy "own admin row" on public.app_admins for select using (user_id = auth.uid());

-- Przeniesienie istniejących administratorów (jeśli tabela radaru istnieje).
do $$
begin
  if to_regclass('public.radar_admins') is not null then
    insert into public.app_admins (user_id, created_at) select user_id, created_at from public.radar_admins on conflict do nothing;
  end if;
end
$$;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.app_admins a where a.user_id = auth.uid()) $$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated, service_role;

-- 2. Obiekty z migracji 0005, które korzystały z radaru.
drop policy if exists "radar admin deletion log" on public.account_deletion_log;
drop policy if exists "admin deletion log" on public.account_deletion_log;
create policy "admin deletion log" on public.account_deletion_log for select using (public.is_app_admin());

create or replace function public.profiles_birth_audit() returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  if not public.is_app_admin() then raise exception 'brak uprawnień'; end if;
  return jsonb_build_object(
    'profilesTotal', (select count(*) from public.profiles),
    'withBirthFields', (select count(*) from public.profiles where data ?| array['birthDate','birthYear','dob','dateOfBirth','birthday']),
    'underMinAge', (select count(*) from public.profiles where jsonb_typeof(data->'age') = 'number' and (data->>'age')::numeric < 16));
end
$$;

create or replace function public.strip_profile_birth_fields(p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare n integer;
begin
  if not public.is_app_admin() then raise exception 'brak uprawnień'; end if;
  select count(*) into n from public.profiles where data ?| array['birthDate','birthYear','dob','dateOfBirth','birthday'];
  if p_dry_run then return jsonb_build_object('dryRun', true, 'wouldUpdate', n, 'note', 'Nic nie zmieniono. Zrób kopię zapasową i wywołaj z p_dry_run => false.'); end if;
  update public.profiles set data = data - 'birthDate' - 'birthYear' - 'dob' - 'dateOfBirth' - 'birthday' where data ?| array['birthDate','birthYear','dob','dateOfBirth','birthday'];
  return jsonb_build_object('dryRun', false, 'updated', n);
end
$$;

-- Eksport i usunięcie danych użytkownika: bez tabeli radaru (która przestaje istnieć).
create or replace function public.export_my_data() returns jsonb
language plpgsql security invoker set search_path = public as
$$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'wymagane zalogowanie'; end if;
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', (select to_jsonb(p) - 'user_id' from public.profiles p where p.user_id = u),
    'masTests', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id') from public.mas_tests m where m.user_id = u), '[]'),
    'weightLog', coalesce((select jsonb_agg(to_jsonb(w) - 'user_id') from public.weight_log w where w.user_id = u), '[]'),
    'checkIns', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id') from public.check_ins c where c.user_id = u), '[]'),
    'ageDeclarations', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id') from public.age_declarations a where a.user_id = u), '[]'),
    'agreements', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id') from public.agreement_events g where g.user_id = u), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id') from public.consent_events c where c.user_id = u), '[]'),
    'guardianConfirmations', coalesce((select jsonb_agg(jsonb_build_object('contractVersion', contract_version, 'status', status, 'requestedAt', requested_at,
                                                                           'expiresAt', expires_at, 'confirmedAt', confirmed_at, 'revokedAt', revoked_at))
                                       from public.guardian_confirmations where user_id = u), '[]'),
    'paidAccess', (select to_jsonb(p) - 'user_id' from public.paid_access p where p.user_id = u));
end
$$;

create or replace function public.erase_user_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare counts jsonb := '{}'; n integer; t text; lid uuid;
begin
  insert into public.account_deletion_log (user_hash, status) values (public.sha256_hex(p_user::text), 'started') returning id into lid;
  foreach t in array array['paid_access', 'guardian_confirmations', 'consent_events', 'agreement_events', 'age_declarations', 'check_ins', 'weight_log', 'mas_tests', 'profiles'] loop
    execute format('delete from public.%I where user_id = $1', t) using p_user;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  update public.account_deletion_log set status = 'data_erased', steps = counts where id = lid;
  return jsonb_build_object('logId', lid, 'deleted', counts);
end
$$;

-- 3. Wyłączenie zadań cyklicznych radaru (jeśli pg_cron jest zainstalowany).
do $$
begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    perform cron.unschedule(jobname) from cron.job where jobname in ('radar-expire', 'radar-refresh', 'radar-discover');
  end if;
end
$$;

-- 4. Usunięcie funkcji, a potem tabel radaru (wszystko z prefiksem radar_ w schemacie public).
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'radar\_%' loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
  for r in select tablename from pg_tables where schemaname = 'public' and tablename like 'radar\_%' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
end
$$;
