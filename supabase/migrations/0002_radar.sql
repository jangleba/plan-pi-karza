-- Ballwise: radar „Piłkarskie szanse” – dane, reguły aktualności i funkcje dla zadań serwerowych.
-- Zakładamy Supabase (schemat auth, role anon/authenticated/service_role). Harmonogramy: 0003_radar_schedules.sql.
--
-- Zasady:
--  * ogłoszenie ≠ sesja: zasady wieku/rocznika są PER SESJA (radar_sessions),
--  * source_checked_at (poprawne sprawdzenie źródła) ≠ organizer_confirmed_at (potwierdzenie treści przez organizatora),
--  * odczyt publiczny wyłącznie przez radar_feed()/radar_get_listings(); tabele są zamknięte (RLS) poza administratorem,
--  * funkcje zadań (lock, kolejka, upsert, wygaszanie) tylko dla service_role.

create table public.radar_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.radar_is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.radar_admins a where a.user_id = auth.uid()) $$;

create table public.radar_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.radar_settings (key, value) values
  ('discover_interval_hours', '12'),
  ('refresh_interval_hours', '6'),
  ('expire_interval_minutes', '15'),
  ('brave_queries_per_run', '20'),
  ('brave_daily_query_budget', '40'),
  ('brave_pages_per_query', '1'),
  ('max_new_urls_per_run', '40'),
  ('max_refreshes_per_run', '30'),
  ('ai_daily_extraction_budget', '200'),
  ('monitor_pages_per_source', '3'),
  ('job_lock_ttl_seconds', '600')
on conflict (key) do nothing;

-- ---------- rejestr źródeł ----------
create table public.radar_sources (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  name text,
  kind text not null default 'other' check (kind in ('club', 'academy', 'federation', 'organizer', 'other')),
  status text not null default 'candidate' check (status in ('candidate', 'approved', 'rejected', 'suspended')),
  -- podstawa dopuszczenia (licencja/zgoda/umowa); publiczna dostępność, robots.txt ani RSS same nie są licencją
  license_basis text,
  allowed_scope jsonb not null default '{"fetch": false, "publish_facts": false, "images": false}',
  entry_urls text[] not null default '{}', -- RSS/Atom, mapy witryn, działy aktualności (z paginacją)
  check_interval_minutes integer not null default 360 check (check_interval_minutes >= 15),
  crawl_delay_seconds integer not null default 2 check (crawl_delay_seconds >= 0),
  robots_txt text,
  robots_checked_at timestamptz,
  robots_block_all boolean not null default false,
  discovered_via text not null default 'manual' check (discovered_via in ('manual', 'search')),
  sample_url text,
  sample_title text,
  found_query text,
  seen_count integer not null default 1,
  next_check_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_ok_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint radar_approved_needs_basis check (status <> 'approved' or (license_basis is not null and length(btrim(license_basis)) >= 10))
);

-- ---------- kolejka adresów do sprawdzenia ----------
create table public.radar_urls (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.radar_sources(id) on delete cascade,
  url text not null,
  url_hash text not null unique,
  via text not null default 'monitor' check (via in ('monitor', 'search')),
  found_query text,
  title text,
  state text not null default 'pending' check (state in ('pending', 'claimed', 'done', 'skipped', 'failed', 'review')),
  tries integer not null default 0,
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index radar_urls_state_idx on public.radar_urls (state, created_at);

-- ---------- ogłoszenia i sesje ----------
create table public.radar_listings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.radar_sources(id) on delete set null,
  url text not null,
  url_hash text not null unique,
  kind text not null check (kind in ('nabor', 'testy', 'trening_otwarty', 'testy_bramkarskie', 'inne')),
  organizer text not null,
  title text,
  summary text not null, -- własny, krótki opis faktów
  city text,
  venue text,
  lat double precision,
  lon double precision,
  positions jsonb not null default '{"scope": "unknown"}',
  signup_mode text not null default 'unknown' check (signup_mode in ('individual', 'team_only', 'unknown')),
  signup_status text not null default 'unknown' check (signup_status in ('open', 'closed', 'cancelled', 'full', 'unknown')),
  cost_state text not null default 'unknown' check (cost_state in ('free', 'paid', 'unknown')),
  cost_pln numeric,
  requirements_text text, -- cytaty z ogłoszenia (obok interpretacji w panelu administratora)
  eligibility jsonb, -- domyślne zasady (oferty bezterminowe / jedna reguła dla wszystkich sesji)
  indefinite boolean not null default false,
  signup_closes_at timestamptz, -- moment WYKLUCZAJĄCY (sama data = początek następnego dnia w Europe/Warsaw)
  published_at timestamptz,
  status text not null default 'pending_review' check (status in ('pending_review', 'published', 'withdrawn', 'expired', 'duplicate')),
  review_reasons text[] not null default '{}',
  duplicate_of uuid references public.radar_listings(id) on delete set null,
  withdrawn_reason text,
  source_checked_at timestamptz,
  organizer_confirmed_at timestamptz,
  content_hash text,
  first_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index radar_listings_status_idx on public.radar_listings (status);

create table public.radar_sessions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.radar_listings(id) on delete cascade,
  date date not null,
  start_time text not null default '', -- '' = godzina nieznana (godzin nie wymyślamy)
  starts_at timestamptz,
  city text,
  venue text,
  lat double precision,
  lon double precision,
  eligibility jsonb, -- zasady wieku TEJ sesji
  status text not null default 'active' check (status in ('active', 'cancelled')),
  fingerprint text not null, -- organizator#miejscowość#data#zasady (bez godziny) – wykrywanie duplikatów
  evidence text,
  created_at timestamptz not null default now(),
  unique (listing_id, fingerprint, start_time)
);
create index radar_sessions_listing_idx on public.radar_sessions (listing_id);
create index radar_sessions_fp_idx on public.radar_sessions (fingerprint);

create table public.radar_evidence (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.radar_listings(id) on delete cascade,
  field text not null,
  quote text not null,
  created_at timestamptz not null default now()
);

create table public.radar_checks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.radar_listings(id) on delete cascade,
  source_id uuid references public.radar_sources(id) on delete cascade,
  url text,
  outcome text not null, -- ok | http_error | captcha | login_wall | empty | blocked_robots | ssrf | too_large | timeout | parse_failed | ...
  http_status integer,
  valid boolean not null, -- tylko poprawne sprawdzenie odnawia source_checked_at
  content_hash text,
  details jsonb,
  checked_at timestamptz not null default now()
);
create index radar_checks_listing_idx on public.radar_checks (listing_id, checked_at desc);

create table public.radar_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.radar_listings(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create table public.radar_saved (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.radar_listings(id) on delete cascade,
  saved_at timestamptz not null default now(),
  notify_changes boolean not null default false,
  primary key (user_id, listing_id)
);

create table public.radar_job_runs (
  id uuid primary key,
  job text not null check (job in ('discover', 'refresh', 'expire')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed', 'skipped')),
  stats jsonb not null default '{}',
  error text
);
create index radar_job_runs_idx on public.radar_job_runs (job, started_at desc);

create table public.radar_job_locks (
  job text primary key,
  run_id uuid not null,
  locked_until timestamptz not null
);

create table public.radar_search_usage (
  day date not null,
  kind text not null,
  used integer not null default 0,
  primary key (day, kind)
);

-- ---------- RLS: zamknięte dla użytkowników poza administratorem i własnymi zapisami ----------
alter table public.radar_admins enable row level security;
alter table public.radar_settings enable row level security;
alter table public.radar_sources enable row level security;
alter table public.radar_urls enable row level security;
alter table public.radar_listings enable row level security;
alter table public.radar_sessions enable row level security;
alter table public.radar_evidence enable row level security;
alter table public.radar_checks enable row level security;
alter table public.radar_reports enable row level security;
alter table public.radar_saved enable row level security;
alter table public.radar_job_runs enable row level security;
alter table public.radar_job_locks enable row level security;
alter table public.radar_search_usage enable row level security;

create policy "radar admin settings" on public.radar_settings for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin sources" on public.radar_sources for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin urls" on public.radar_urls for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin listings" on public.radar_listings for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin sessions" on public.radar_sessions for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin evidence" on public.radar_evidence for select using (public.radar_is_admin());
create policy "radar admin checks" on public.radar_checks for select using (public.radar_is_admin());
create policy "radar admin reports" on public.radar_reports for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin job runs" on public.radar_job_runs for select using (public.radar_is_admin());
create policy "radar admin usage" on public.radar_search_usage for select using (public.radar_is_admin());
create policy "radar own admin row" on public.radar_admins for select using (user_id = auth.uid());
-- zapisane oferty: wyłącznie własne wiersze
create policy "radar own saved" on public.radar_saved for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- radar_job_locks: brak polityk = tylko service_role

-- ---------- aktualność (te same reguły co supabase/functions/_shared/radar/freshness.ts) ----------
create function public.radar_session_start(s public.radar_sessions) returns timestamptz
language sql immutable set search_path = public as
$$ select coalesce(s.starts_at, (s.date::timestamp) at time zone 'Europe/Warsaw') $$;

create function public.radar_listing_live(l public.radar_listings, p_now timestamptz default now(), p_allow_expired boolean default false) returns boolean
language sql stable set search_path = public as
$$
  select (l.status = 'published' or (p_allow_expired and l.status = 'expired'))
     and l.signup_status not in ('closed', 'cancelled', 'full')
     and (l.signup_closes_at is null or p_now < l.signup_closes_at)
     and l.source_checked_at is not null
     and p_now - l.source_checked_at <= interval '48 hours'
     and case
           when l.indefinite then l.organizer_confirmed_at is not null and p_now - l.organizer_confirmed_at <= interval '7 days'
           else exists (select 1 from public.radar_sessions s where s.listing_id = l.id and s.status = 'active' and p_now < public.radar_session_start(s))
         end
$$;

create function public.radar_listing_json(l public.radar_listings) returns jsonb
language sql stable set search_path = public as
$$
  select jsonb_build_object(
    'id', l.id, 'url', l.url, 'kind', l.kind, 'organizer', l.organizer, 'title', l.title, 'summary', l.summary,
    'city', l.city, 'venue', l.venue, 'lat', l.lat, 'lon', l.lon, 'positions', l.positions,
    'signupMode', l.signup_mode, 'signupStatus', l.signup_status, 'costState', l.cost_state, 'costPln', l.cost_pln,
    'requirementsText', l.requirements_text, 'eligibility', l.eligibility, 'indefinite', l.indefinite,
    'signupClosesAt', l.signup_closes_at, 'publishedAt', l.published_at, 'status', l.status,
    'sourceCheckedAt', l.source_checked_at, 'organizerConfirmedAt', l.organizer_confirmed_at,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'date', s.date, 'startTime', nullif(s.start_time, ''), 'startsAt', s.starts_at, 'city', s.city, 'venue', s.venue,
        'lat', s.lat, 'lon', s.lon, 'eligibility', s.eligibility, 'status', s.status) order by s.date, s.start_time)
      from public.radar_sessions s where s.listing_id = l.id), '[]'::jsonb))
$$;

-- Kondycja zadań dla ekranu Start: awaria aktualizacji źródeł to inny stan niż brak ofert
create function public.radar_health() returns jsonb
language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'lastRefreshOkAt', (select max(finished_at) from public.radar_job_runs where job = 'refresh' and status in ('ok', 'partial')),
    'lastDiscoverOkAt', (select max(finished_at) from public.radar_job_runs where job = 'discover' and status in ('ok', 'partial')),
    'lastExpireOkAt', (select max(finished_at) from public.radar_job_runs where job = 'expire' and status = 'ok'),
    'failingSources', (select count(*) from public.radar_sources where status = 'approved' and consecutive_failures >= 3),
    'approvedSources', (select count(*) from public.radar_sources where status = 'approved'))
$$;

-- Publiczny odczyt: gotowe, AKTUALNE ogłoszenia (aktualność liczona przy odczycie, nie tylko przez zadanie wygaszające)
create function public.radar_feed() returns jsonb
language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'serverNow', now(),
    'health', public.radar_health(),
    'listings', coalesce((select jsonb_agg(public.radar_listing_json(l) order by l.first_seen_at, l.id) from public.radar_listings l where public.radar_listing_live(l, now())), '[]'::jsonb))
$$;

-- Zapisane oferty: także wygasłe (z właściwym statusem), po identyfikatorach
create function public.radar_get_listings(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'serverNow', now(),
    'listings', coalesce((select jsonb_agg(public.radar_listing_json(l) || jsonb_build_object('live', public.radar_listing_live(l, now())))
                          from public.radar_listings l where l.id = any (p_ids) and l.status <> 'pending_review' limit 200), '[]'::jsonb))
$$;

-- Zgłoszenie nieaktualności (anonimowe, z ograniczeniem częstotliwości; zgłoszenie idzie do administratora, nie do organizatora)
create function public.radar_report_stale(p_listing uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = public as
$$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 500 then return false; end if;
  if not exists (select 1 from public.radar_listings where id = p_listing and status in ('published', 'expired')) then return false; end if;
  if (select count(*) from public.radar_reports where listing_id = p_listing and created_at > now() - interval '1 hour') >= 5 then return false; end if;
  insert into public.radar_reports (listing_id, reason) values (p_listing, btrim(p_reason));
  return true;
end
$$;

-- ---------- zadania: blokada, historia, budżet ----------
create function public.radar_settings_get() returns jsonb
language sql stable set search_path = public as
$$ select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.radar_settings $$;

-- Blokada równoległego wykonania tego samego zadania; wygasa po TTL, więc nie zawiesza się na stałe po awarii.
create function public.radar_try_lock(p_job text, p_ttl_seconds integer default 600) returns uuid
language plpgsql set search_path = public as
$$
declare r uuid := gen_random_uuid();
begin
  insert into public.radar_job_locks (job, run_id, locked_until) values (p_job, r, now() + make_interval(secs => p_ttl_seconds))
  on conflict (job) do update set run_id = excluded.run_id, locked_until = excluded.locked_until
  where public.radar_job_locks.locked_until < now();
  if not found then
    insert into public.radar_job_runs (id, job, status, finished_at, stats) values (gen_random_uuid(), p_job, 'skipped', now(), '{"reason": "locked"}');
    return null;
  end if;
  insert into public.radar_job_runs (id, job) values (r, p_job);
  return r;
end
$$;

create function public.radar_finish_job(p_run uuid, p_status text, p_stats jsonb default '{}', p_error text default null) returns void
language plpgsql set search_path = public as
$$
begin
  update public.radar_job_runs set finished_at = now(), status = p_status, stats = coalesce(p_stats, '{}'), error = left(p_error, 2000) where id = p_run;
  delete from public.radar_job_locks where run_id = p_run;
end
$$;

-- Budżet dzienny (dzień lokalny): zwraca, ile jednostek faktycznie przyznano.
create function public.radar_budget_take(p_kind text, p_n integer, p_limit integer) returns integer
language plpgsql set search_path = public as
$$
declare d date := (now() at time zone 'Europe/Warsaw')::date; u integer; g integer;
begin
  insert into public.radar_search_usage (day, kind, used) values (d, p_kind, 0) on conflict do nothing;
  select used into u from public.radar_search_usage where day = d and kind = p_kind for update;
  g := least(greatest(p_n, 0), greatest(p_limit - u, 0));
  update public.radar_search_usage set used = u + g where day = d and kind = p_kind;
  return g;
end
$$;

-- ---------- źródła i kolejka ----------
-- Nowa domena trafia do rejestru jako KANDYDAT (do oceny); zatwierdzonych/odrzuconych nie zmieniamy.
create function public.radar_upsert_candidate_source(p_domain text, p_sample_url text, p_title text, p_query text, p_via text default 'search') returns uuid
language plpgsql set search_path = public as
$$
declare sid uuid;
begin
  insert into public.radar_sources (domain, status, discovered_via, sample_url, sample_title, found_query)
  values (lower(p_domain), 'candidate', p_via, p_sample_url, left(p_title, 300), left(p_query, 300))
  on conflict (domain) do update set seen_count = public.radar_sources.seen_count + 1
  returning id into sid;
  return sid;
end
$$;

-- Kolejkowanie adresów (idempotentne po url_hash; adresy znanych ogłoszeń pomijamy).
create function public.radar_enqueue_urls(p_source uuid, p_urls jsonb) returns integer
language plpgsql set search_path = public as
$$
declare n integer;
begin
  with ins as (
    insert into public.radar_urls (source_id, url, url_hash, via, found_query, title)
    select p_source, x->>'url', x->>'hash', coalesce(x->>'via', 'monitor'), left(x->>'query', 300), left(x->>'title', 300)
    from jsonb_array_elements(p_urls) x
    where not exists (select 1 from public.radar_listings l where l.url_hash = x->>'hash')
    on conflict (url_hash) do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end
$$;

-- Porcja adresów do przetworzenia dla zatwierdzonych źródeł (równoległe wykonania nie biorą tych samych).
create function public.radar_claim_urls(p_limit integer, p_ttl_seconds integer default 900) returns setof public.radar_urls
language plpgsql set search_path = public as
$$
begin
  return query
  with picked as (
    select u.id from public.radar_urls u
    join public.radar_sources s on s.id = u.source_id and s.status = 'approved' and (s.allowed_scope->>'fetch')::boolean
    where u.tries < 5 and (u.state = 'pending' or (u.state = 'claimed' and u.claimed_at < now() - make_interval(secs => p_ttl_seconds)))
    order by u.created_at
    limit p_limit
    for update of u skip locked)
  update public.radar_urls u set state = 'claimed', tries = u.tries + 1, claimed_at = now(), updated_at = now()
  from picked where u.id = picked.id
  returning u.*;
end
$$;

create function public.radar_complete_url(p_id uuid, p_state text, p_error text default null) returns void
language sql set search_path = public as
$$ update public.radar_urls set state = p_state, last_error = left(p_error, 500), updated_at = now() where id = p_id $$;

create function public.radar_due_sources(p_limit integer) returns setof public.radar_sources
language sql stable set search_path = public as
$$
  select * from public.radar_sources
  where status = 'approved' and (allowed_scope->>'fetch')::boolean and not robots_block_all and next_check_at <= now() and cardinality(entry_urls) > 0
  order by next_check_at limit p_limit
$$;

-- Zapis wyniku sprawdzenia źródła; po błędach odstęp rośnie (wykładniczo do 6×), by nie męczyć serwisu.
create function public.radar_mark_source_checked(p_id uuid, p_ok boolean, p_error text default null, p_robots_txt text default null, p_robots_block_all boolean default null) returns void
language plpgsql set search_path = public as
$$
begin
  update public.radar_sources set
    last_checked_at = now(),
    last_ok_at = case when p_ok then now() else last_ok_at end,
    consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    next_check_at = now() + make_interval(mins => check_interval_minutes * (1 + least(case when p_ok then 0 else consecutive_failures + 1 end, 5))),
    robots_txt = case when p_robots_block_all is null then robots_txt else p_robots_txt end,
    robots_block_all = coalesce(p_robots_block_all, robots_block_all),
    robots_checked_at = case when p_robots_block_all is null then robots_checked_at else now() end
  where id = p_id;
end
$$;

-- Ogłoszenia do odświeżenia: opublikowane ORAZ wygasłe z powodu nieaktualności źródła (mają jeszcze przyszłe terminy – wrócą,
-- gdy źródło znów odpowiada), z zatwierdzonego źródła; najdawniej sprawdzane pierwsze, z odstępem źródła.
create function public.radar_due_listings(p_limit integer) returns setof public.radar_listings
language sql stable set search_path = public as
$$
  select l.* from public.radar_listings l
  join public.radar_sources s on s.id = l.source_id and s.status = 'approved' and (s.allowed_scope->>'fetch')::boolean and not s.robots_block_all
  where (l.status = 'published'
         or (l.status = 'expired' and l.updated_at > now() - interval '14 days' and l.signup_status not in ('closed', 'cancelled', 'full')
             and (l.signup_closes_at is null or l.signup_closes_at > now())
             and (l.indefinite or exists (select 1 from public.radar_sessions x where x.listing_id = l.id and x.status = 'active' and now() < public.radar_session_start(x)))))
    and coalesce(l.source_checked_at, 'epoch'::timestamptz) < now() - make_interval(mins => s.check_interval_minutes)
  order by coalesce(l.source_checked_at, 'epoch'::timestamptz) limit p_limit
$$;

-- Wynik sprawdzenia: TYLKO poprawne (valid) odnawia source_checked_at; błąd, logowanie, CAPTCHA i pusta strona – nie.
create function public.radar_record_check(p_listing uuid, p_source uuid, p_url text, p_outcome text, p_http integer, p_valid boolean, p_hash text, p_details jsonb default null) returns void
language plpgsql set search_path = public as
$$
begin
  insert into public.radar_checks (listing_id, source_id, url, outcome, http_status, valid, content_hash, details) values (p_listing, p_source, p_url, p_outcome, p_http, p_valid, p_hash, p_details);
  if p_valid and p_listing is not null then
    update public.radar_listings set source_checked_at = now(), updated_at = now() where id = p_listing;
    -- ogłoszenie wygasłe z powodu nieaktualności źródła wraca po poprawnym sprawdzeniu, jeśli spełnia wszystkie reguły aktualności
    update public.radar_listings l set status = 'published', updated_at = now()
      where l.id = p_listing and l.status = 'expired' and l.review_reasons = '{}' and public.radar_listing_live(l, now(), true);
  end if;
end
$$;

-- ---------- zapis ogłoszenia ----------
-- p: { url, urlHash, sourceId, contentHash, publish, reviewReasons[], organizerConfirmedAt?,
--      listing{...}, sessions[{date,startTime,startsAt,city,venue,lat,lon,eligibility,fingerprint,evidence}], evidence[{field,quote}] }
-- Źródło poprawnie pobrane i odczytane → source_checked_at = teraz. organizer_confirmed_at zmienia się tylko, gdy treść niesie
-- nowszą datę potwierdzenia organizatora (ponowne pobranie starej strony go NIE odnawia).
create function public.radar_upsert_listing(p jsonb) returns jsonb
language plpgsql set search_path = public as
$$
declare
  l jsonb := p->'listing';
  existing public.radar_listings;
  lid uuid;
  new_status text;
  created boolean := false;
  changed boolean := false;
  conf timestamptz := nullif(p->>'organizerConfirmedAt', '')::timestamptz;
  dup uuid;
  fps text[];
begin
  select * into existing from public.radar_listings where url_hash = p->>'urlHash' for update;

  new_status := case when coalesce((p->>'publish')::boolean, false) then 'published' else 'pending_review' end;
  if existing.id is not null and existing.status = 'withdrawn' then new_status := 'withdrawn'; end if; -- decyzja administratora wygrywa

  if existing.id is null then
    created := true;
    insert into public.radar_listings (source_id, url, url_hash, kind, organizer, title, summary, city, venue, lat, lon, positions, signup_mode, signup_status,
      cost_state, cost_pln, requirements_text, eligibility, indefinite, signup_closes_at, published_at, status, review_reasons, source_checked_at,
      organizer_confirmed_at, content_hash)
    values (nullif(p->>'sourceId', '')::uuid, p->>'url', p->>'urlHash', l->>'kind', l->>'organizer', l->>'title', l->>'summary', l->>'city', l->>'venue',
      (l->>'lat')::double precision, (l->>'lon')::double precision, coalesce(l->'positions', '{"scope":"unknown"}'), coalesce(l->>'signupMode', 'unknown'),
      coalesce(l->>'signupStatus', 'unknown'), coalesce(l->>'costState', 'unknown'), (l->>'costPln')::numeric, l->>'requirementsText', nullif(l->'eligibility', 'null'::jsonb),
      coalesce((l->>'indefinite')::boolean, false), nullif(l->>'signupClosesAt', '')::timestamptz, nullif(l->>'publishedAt', '')::timestamptz,
      new_status, coalesce(array(select jsonb_array_elements_text(coalesce(p->'reviewReasons', '[]'))), '{}'), now(), conf, p->>'contentHash')
    returning id into lid;
  else
    lid := existing.id;
    changed := existing.content_hash is distinct from (p->>'contentHash');
    update public.radar_listings set
      kind = l->>'kind', organizer = l->>'organizer', title = l->>'title', summary = l->>'summary', city = l->>'city', venue = l->>'venue',
      lat = (l->>'lat')::double precision, lon = (l->>'lon')::double precision, positions = coalesce(l->'positions', '{"scope":"unknown"}'),
      signup_mode = coalesce(l->>'signupMode', 'unknown'), signup_status = coalesce(l->>'signupStatus', 'unknown'),
      cost_state = coalesce(l->>'costState', 'unknown'), cost_pln = (l->>'costPln')::numeric, requirements_text = l->>'requirementsText',
      eligibility = nullif(l->'eligibility', 'null'::jsonb), indefinite = coalesce((l->>'indefinite')::boolean, false),
      signup_closes_at = nullif(l->>'signupClosesAt', '')::timestamptz, published_at = coalesce(nullif(l->>'publishedAt', '')::timestamptz, published_at),
      status = new_status, review_reasons = coalesce(array(select jsonb_array_elements_text(coalesce(p->'reviewReasons', '[]'))), '{}'),
      source_checked_at = now(),
      organizer_confirmed_at = case when conf is not null and (organizer_confirmed_at is null or conf > organizer_confirmed_at) then conf else organizer_confirmed_at end,
      content_hash = p->>'contentHash', last_changed_at = case when changed then now() else last_changed_at end, updated_at = now()
    where id = lid;
  end if;

  -- sesje: aktualizacja po (fingerprint, godzina); brakujące w nowym odczycie oznaczamy jako odwołane (historia zostaje)
  update public.radar_sessions set status = 'cancelled' where listing_id = lid
    and not exists (select 1 from jsonb_array_elements(coalesce(p->'sessions', '[]')) x
                    where x->>'fingerprint' = radar_sessions.fingerprint and coalesce(x->>'startTime', '') = radar_sessions.start_time);
  insert into public.radar_sessions (listing_id, date, start_time, starts_at, city, venue, lat, lon, eligibility, status, fingerprint, evidence)
  select lid, (x->>'date')::date, coalesce(x->>'startTime', ''), nullif(x->>'startsAt', '')::timestamptz, x->>'city', x->>'venue', (x->>'lat')::double precision, (x->>'lon')::double precision,
         nullif(x->'eligibility', 'null'::jsonb), 'active', x->>'fingerprint', left(x->>'evidence', 1000)
  from jsonb_array_elements(coalesce(p->'sessions', '[]')) x
  on conflict (listing_id, fingerprint, start_time) do update set
    date = excluded.date, starts_at = excluded.starts_at, city = excluded.city, venue = excluded.venue, lat = excluded.lat, lon = excluded.lon,
    eligibility = excluded.eligibility, status = 'active', evidence = excluded.evidence;

  delete from public.radar_evidence where listing_id = lid;
  insert into public.radar_evidence (listing_id, field, quote)
  select lid, x->>'field', left(x->>'quote', 1000) from jsonb_array_elements(coalesce(p->'evidence', '[]')) x;

  -- duplikat: wszystkie sesje tego ogłoszenia istnieją już w innym (starszym) opublikowanym
  fps := array(select distinct fingerprint from public.radar_sessions where listing_id = lid and status = 'active');
  if cardinality(fps) > 0 and new_status = 'published' then
    select s.listing_id into dup from public.radar_sessions s join public.radar_listings o on o.id = s.listing_id
      where o.id <> lid and o.status = 'published' and o.first_seen_at <= (select first_seen_at from public.radar_listings where id = lid)
        and s.fingerprint = any (fps) and s.status = 'active'
      group by s.listing_id having count(distinct s.fingerprint) = cardinality(fps) limit 1;
    if dup is not null then
      update public.radar_listings set status = 'duplicate', duplicate_of = dup where id = lid;
      new_status := 'duplicate';
    end if;
  end if;

  return jsonb_build_object('id', lid, 'status', new_status, 'created', created, 'changed', changed);
end
$$;

-- ---------- wygaszanie ----------
create function public.radar_expire(p_now timestamptz default now()) returns jsonb
language plpgsql set search_path = public as
$$
declare n integer;
begin
  update public.radar_listings l set status = 'expired', updated_at = p_now
  where l.status = 'published' and not public.radar_listing_live(l, p_now);
  get diagnostics n = row_count;
  -- stare, nieobsłużone wpisy w kolejce nie blokują porcji
  update public.radar_urls set state = 'failed', last_error = 'przeterminowane w kolejce', updated_at = p_now where state = 'claimed' and claimed_at < p_now - interval '1 day';
  return jsonb_build_object('expired', n, 'at', p_now);
end
$$;

-- Robots.txt źródła (cache 24 h); „blokada całości” przy 5xx – ostrożnie nie pobieramy.
create function public.radar_set_robots(p_id uuid, p_txt text, p_block_all boolean) returns void
language sql set search_path = public as
$$ update public.radar_sources set robots_txt = p_txt, robots_block_all = p_block_all, robots_checked_at = now() where id = p_id $$;

create function public.radar_get_source(p_domain text) returns setof public.radar_sources
language sql stable set search_path = public as
$$ select * from public.radar_sources where domain = lower(p_domain) $$;

create function public.radar_get_source_by_id(p_id uuid) returns setof public.radar_sources
language sql stable set search_path = public as
$$ select * from public.radar_sources where id = p_id $$;

-- Zmiana statusu przez zadanie (np. strona usunięta); „wycofane” przez administratora jest nietykalne.
create function public.radar_set_listing_status(p_id uuid, p_status text, p_reason text default null) returns void
language sql set search_path = public as
$$ update public.radar_listings set status = p_status, withdrawn_reason = left(p_reason, 500), updated_at = now() where id = p_id and status <> 'withdrawn' $$;

-- Wygaszanie jako zadanie z blokadą i historią; porządkuje też stare wpisy (retencja: przebiegi 30 dni, sprawdzenia 90 dni).
create function public.radar_run_expire() returns jsonb
language plpgsql set search_path = public as
$$
declare run uuid; res jsonb;
begin
  run := public.radar_try_lock('expire', 300);
  if run is null then return jsonb_build_object('skipped', true); end if;
  begin
    res := public.radar_expire();
    delete from public.radar_job_runs where started_at < now() - interval '30 days';
    delete from public.radar_checks where checked_at < now() - interval '90 days';
    perform public.radar_finish_job(run, 'ok', res, null);
    return res;
  exception when others then
    perform public.radar_finish_job(run, 'failed', '{}'::jsonb, sqlerrm);
    raise;
  end;
end
$$;

-- ---------- akcje administratora: SECURITY INVOKER – i tak działa tylko RLS administratora, a rola jest sprawdzana jawnie ----------
create function public.radar_admin_set_source(p_id uuid, p_status text, p_basis text, p_scope jsonb, p_entry_urls text[], p_name text default null, p_kind text default null) returns void
language plpgsql set search_path = public as
$$
begin
  if not public.radar_is_admin() then raise exception 'brak uprawnień'; end if;
  if p_status = 'approved' and (p_basis is null or char_length(btrim(p_basis)) < 10) then raise exception 'podaj podstawę dopuszczenia (min. 10 znaków)'; end if;
  update public.radar_sources set status = p_status, license_basis = coalesce(p_basis, license_basis), allowed_scope = coalesce(p_scope, allowed_scope),
    entry_urls = coalesce(p_entry_urls, entry_urls), name = coalesce(p_name, name), kind = coalesce(p_kind, kind),
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end, approved_at = case when p_status = 'approved' then now() else approved_at end,
    next_check_at = case when p_status = 'approved' then now() else next_check_at end
  where id = p_id;
end
$$;

create function public.radar_admin_set_listing(p_id uuid, p_action text, p_reason text default null) returns void
language plpgsql set search_path = public as
$$
begin
  if not public.radar_is_admin() then raise exception 'brak uprawnień'; end if;
  if p_action = 'publish' then
    update public.radar_listings set status = 'published', review_reasons = '{}', withdrawn_reason = null, source_checked_at = coalesce(source_checked_at, now()) where id = p_id;
  elsif p_action = 'confirm' then -- administrator potwierdził aktualność u organizatora (np. nabór bezterminowy)
    update public.radar_listings set organizer_confirmed_at = now() where id = p_id;
  elsif p_action = 'withdraw' then
    update public.radar_listings set status = 'withdrawn', withdrawn_reason = left(p_reason, 500) where id = p_id;
  else raise exception 'nieznana akcja';
  end if;
end
$$;

-- ---------- uprawnienia: funkcje zadań tylko dla service_role ----------
do $$
declare f text;
begin
  foreach f in array array[
    'radar_try_lock(text,integer)', 'radar_finish_job(uuid,text,jsonb,text)', 'radar_budget_take(text,integer,integer)',
    'radar_upsert_candidate_source(text,text,text,text,text)', 'radar_enqueue_urls(uuid,jsonb)', 'radar_claim_urls(integer,integer)',
    'radar_complete_url(uuid,text,text)', 'radar_due_sources(integer)', 'radar_mark_source_checked(uuid,boolean,text,text,boolean)',
    'radar_due_listings(integer)', 'radar_record_check(uuid,uuid,text,text,integer,boolean,text,jsonb)', 'radar_upsert_listing(jsonb)',
    'radar_expire(timestamptz)', 'radar_settings_get()', 'radar_set_robots(uuid,text,boolean)', 'radar_get_source(text)',
    'radar_get_source_by_id(uuid)', 'radar_set_listing_status(uuid,text,text)', 'radar_run_expire()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- publiczny odczyt i zgłoszenia
  foreach f in array array['radar_feed()', 'radar_get_listings(uuid[])', 'radar_report_stale(uuid,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
  foreach f in array array['radar_admin_set_source(uuid,text,text,jsonb,text[],text,text)', 'radar_admin_set_listing(uuid,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end
$$;
