-- Ballwise: rejestracja harmonogramów radaru w pg_cron (RZECZYWISTE zadania serwerowe, nie przeglądarka).
--   radar-expire   – co 15 min, w całości w SQL (radar_run_expire: blokada, historia, wygaszanie, retencja),
--   radar-refresh  – co 6 h  → Edge Function radar-refresh,
--   radar-discover – co 12 h → Edge Function radar-discover.
-- Interwały pochodzą z radar_settings; po zmianie uruchom ponownie:  select public.radar_register_schedules();
-- Rejestracja jest idempotentna (nazwane zadania są aktualizowane, nie dublowane).
--
-- WYMAGANE JEDNORAZOWO (Supabase SQL Editor), zanim zadania HTTP zaczną działać:
--   select vault.create_secret('https://<ref>.supabase.co', 'radar_project_url');
--   select vault.create_secret('<losowy-sekret>', 'radar_cron_secret');   -- ten sam wpis w sekretach funkcji: RADAR_CRON_SECRET
--   select public.radar_register_schedules();

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Wyrażenie cron z interwału: minuty (dzielniki 60) lub pełne godziny (dzielniki 24). Inne wartości są odrzucane.
create function public.radar_cron_expr(p_minutes integer) returns text
language plpgsql immutable as
$$
begin
  if p_minutes between 1 and 59 and 60 % p_minutes = 0 then return format('*/%s * * * *', p_minutes); end if;
  if p_minutes >= 60 and p_minutes % 60 = 0 and 24 % (p_minutes / 60) = 0 then
    return case when p_minutes / 60 = 24 then '0 0 * * *' else format('0 */%s * * *', p_minutes / 60) end;
  end if;
  raise exception 'nieobsługiwany interwał: % min (użyj dzielnika 60 min albo 24 h)', p_minutes;
end
$$;

create function public.radar_register_schedules() returns jsonb
language plpgsql security definer set search_path = public, extensions as
$$
declare
  s jsonb := public.radar_settings_get();
  url_ok boolean := exists (select 1 from vault.decrypted_secrets where name = 'radar_project_url');
  sec_ok boolean := exists (select 1 from vault.decrypted_secrets where name = 'radar_cron_secret');
  expire_expr text := public.radar_cron_expr((s->>'expire_interval_minutes')::int);
  refresh_expr text := public.radar_cron_expr((s->>'refresh_interval_hours')::int * 60);
  discover_expr text := public.radar_cron_expr((s->>'discover_interval_hours')::int * 60);
  http text := $c$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'radar_project_url') || '/functions/v1/%s',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-radar-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'radar_cron_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 120000)$c$;
begin
  -- wygaszanie nie wymaga sekretów (czysty SQL), więc rejestrujemy je zawsze
  perform cron.schedule('radar-expire', expire_expr, 'select public.radar_run_expire()');
  if not (url_ok and sec_ok) then
    raise notice 'Zarejestrowano tylko radar-expire. Brak sekretów Vault (radar_project_url, radar_cron_secret) – zadania HTTP (refresh, discover) NIE są zarejestrowane.';
    return jsonb_build_object('expire', expire_expr, 'refresh', null, 'discover', null, 'missingVault', jsonb_build_array(case when url_ok then null else 'radar_project_url' end, case when sec_ok then null else 'radar_cron_secret' end));
  end if;
  -- sekrety odczytywane są w chwili wykonania zadania z Vault, więc nie trafiają do tabeli cron.job
  perform cron.schedule('radar-refresh', refresh_expr, format(http, 'radar-refresh'));
  perform cron.schedule('radar-discover', discover_expr, format(http, 'radar-discover'));
  return jsonb_build_object('expire', expire_expr, 'refresh', refresh_expr, 'discover', discover_expr);
end
$$;

create function public.radar_unschedule() returns void
language plpgsql security definer set search_path = public, extensions as
$$
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('radar-expire', 'radar-refresh', 'radar-discover');
end
$$;

-- Stan harmonogramów dla panelu administratora (nazwy, wyrażenia, aktywność, ostatnie uruchomienia pg_cron)
create function public.radar_schedule_status() returns jsonb
language plpgsql security definer set search_path = public, extensions as
$$
begin
  if not public.radar_is_admin() then raise exception 'brak uprawnień'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'lastStart', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
      'lastStatus', (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1)))
    from cron.job j where j.jobname like 'radar-%'), '[]'::jsonb);
end
$$;

revoke all on function public.radar_register_schedules() from public, anon, authenticated;
revoke all on function public.radar_unschedule() from public, anon, authenticated;
revoke all on function public.radar_schedule_status() from public, anon;
grant execute on function public.radar_register_schedules() to service_role;
grant execute on function public.radar_unschedule() to service_role;
grant execute on function public.radar_schedule_status() to authenticated, service_role;

-- Próba rejestracji przy migracji; brak sekretów nie przerywa migracji (zarejestruje się tylko wygaszanie).
do $$
begin
  perform public.radar_register_schedules();
exception when others then
  raise notice 'Rejestracja harmonogramów odroczona: %. Uruchom: select public.radar_register_schedules();', sqlerrm;
end
$$;
