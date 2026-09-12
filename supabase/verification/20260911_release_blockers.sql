-- Read-only post-deployment verification. Safe to run in the SQL editor.
with checks as (
  select 1 as sort, 'TABELE WYMAGANE' as kontrola,
    case when to_regclass('public.exercise_replacements') is not null
           and to_regclass('public.running_activities') is not null
      then 'OK' else 'BRAK' end as wynik
  union all
  select 2, 'START MECZU',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'session_logs' and column_name = 'started_at'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'session_logs' and column_name = 'ended_at'
    ) then 'OK' else 'BRAK KOLUMN' end
  union all
  select 3, 'TRIGGER CYKLU SESJI',
    case when exists (
      select 1 from pg_trigger
      where tgname = 'session_logs_sanitize_lifecycle' and not tgisinternal
    ) then 'OK' else 'BRAK' end
  union all
  select 4, 'TRIGGER OPIEKUNA',
    case when exists (
      select 1 from pg_trigger
      where tgname = 'athlete_profiles_enforce_trusted_fields' and not tgisinternal
    ) then 'OK' else 'BRAK' end
  union all
  select 5, 'AUDYT ZGÓD TYLKO DOPISYWANY',
    case when not has_table_privilege('authenticated', 'public.consent_logs', 'UPDATE')
           and not has_table_privilege('authenticated', 'public.consent_logs', 'DELETE')
      then 'OK' else 'NIEBEZPIECZNE UPRAWNIENIA' end
  union all
  select 6, 'WYCOFANIE ZGODY ZDROWOTNEJ',
    case when to_regprocedure('public.withdraw_health_data_consent(text,text)') is not null
      then 'OK' else 'BRAK FUNKCJI' end
  union all
  select 7, 'PRZEKAZANIE KONTA',
    case when to_regprocedure('public.finalize_athlete_account_handover()') is not null
      and exists (
        select 1 from pg_trigger
        where tgname = 'on_auth_user_email_changed_finalize_handover' and not tgisinternal
      ) then 'OK' else 'BRAK FUNKCJI LUB TRIGGERA' end
  union all
  select 8, 'POLITYKI BIEGANIA',
    count(*)::text || '/4'
    from pg_policies
   where schemaname = 'public'
     and tablename = 'running_activities'
     and policyname in (
       'running_activities_select_own',
       'running_activities_insert_own',
       'running_activities_update_own',
       'running_activities_delete_own'
     )
  union all
  select 9, 'RLS WYŁĄCZONE',
    coalesce(string_agg(quote_ident(n.nspname) || '.' || quote_ident(c.relname), ', '), 'BRAK — RLS jest włączone')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
  union all
  select 10, 'VISION LAB',
    case when to_regclass('public.vision_tests') is null
      then 'OK — tabela usunięta' else 'DO USUNIĘCIA' end
)
select kontrola, wynik from checks order by sort;

