-- Ballwise: radar jako „research klubów” – prawdziwe adresy kontaktowe klubów i akademii (z dowodem), z których zawodnik
-- sam pisze zapytanie o testy/treningi. Aplikacja NIE przepisuje ogłoszeń, nic nie wysyła w imieniu zawodnika.
--
-- Zasady danych kontaktowych:
--  * tylko adresy znalezione dosłownie na stronie klubu (cytat + adres strony + data sprawdzenia); nic nie jest zgadywane,
--  * tylko adresy organizacyjne (biuro@, nabor@, ksorly@…); adresy wyglądające na osobiste (imie.nazwisko@) są pomijane,
--  * domena adresu musi przyjmować pocztę (rekord MX),
--  * nowy klub trafia do akceptacji administratora (domyślnie), publikacja automatyczna tylko po zmianie ustawienia,
--  * wycofany klub trafia na listę zablokowanych domen i nie wraca,
--  * dane znikają, gdy adres nie został potwierdzony na stronie klubu od 45 dni.

insert into public.radar_settings (key, value) values
  ('club_auto_publish', 'false'),
  ('club_queries_per_run', '10'),
  ('club_daily_query_budget', '20'),
  ('club_candidates_per_run', '12'),
  ('club_recheck_days', '14'),
  ('club_max_age_days', '45')
on conflict (key) do nothing;

create table public.radar_blocked_domains (
  domain text primary key,
  reason text,
  created_at timestamptz not null default now()
);

create table public.radar_club_candidates (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  sample_url text,
  sample_title text,
  city_hint text,
  found_query text,
  state text not null default 'pending' check (state in ('pending', 'claimed', 'done', 'skipped', 'failed')),
  tries integer not null default 0,
  claimed_at timestamptz,
  last_error text,
  seen_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.radar_clubs (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  name text not null,
  city text,
  lat double precision,
  lon double precision,
  website text not null,
  recruitment_url text, -- odnośnik do podstrony klubu o naborze/testach (tylko link, bez kopiowania treści)
  recruitment_seen_at timestamptz,
  status text not null default 'pending_review' check (status in ('pending_review', 'published', 'withdrawn', 'stale')),
  review_note text,
  withdrawn_reason text,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_ok_at timestamptz,
  consecutive_failures integer not null default 0,
  next_check_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.radar_club_contacts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.radar_clubs(id) on delete cascade,
  email text not null,
  kind text not null default 'general' check (kind in ('general', 'recruitment')),
  evidence_quote text not null, -- fragment strony, na którym stoi adres
  evidence_url text not null, -- strona, na której adres został znaleziony
  mx_ok boolean not null default false,
  status text not null default 'active' check (status in ('active', 'missing')),
  found_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  unique (club_id, email)
);

create table public.radar_club_reports (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.radar_clubs(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

alter table public.radar_blocked_domains enable row level security;
alter table public.radar_club_candidates enable row level security;
alter table public.radar_clubs enable row level security;
alter table public.radar_club_contacts enable row level security;
alter table public.radar_club_reports enable row level security;

create policy "radar admin blocked" on public.radar_blocked_domains for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin club candidates" on public.radar_club_candidates for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin clubs" on public.radar_clubs for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin club contacts" on public.radar_club_contacts for all using (public.radar_is_admin()) with check (public.radar_is_admin());
create policy "radar admin club reports" on public.radar_club_reports for all using (public.radar_is_admin()) with check (public.radar_is_admin());

-- Klub widoczny dla zawodnika: opublikowany, z co najmniej jednym aktywnym, niedawno potwierdzonym adresem z działającą pocztą
create function public.radar_club_live(c public.radar_clubs, p_now timestamptz default now(), p_max_age_days integer default 45) returns boolean
language sql stable set search_path = public as
$$
  select c.status = 'published' and exists (
    select 1 from public.radar_club_contacts k
    where k.club_id = c.id and k.status = 'active' and k.mx_ok and p_now - k.checked_at <= make_interval(days => p_max_age_days))
$$;

create function public.radar_club_json(c public.radar_clubs, p_now timestamptz default now(), p_max_age_days integer default 45) returns jsonb
language sql stable set search_path = public as
$$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'city', c.city, 'lat', c.lat, 'lon', c.lon, 'website', c.website,
    'recruitmentUrl', c.recruitment_url, 'checkedAt', c.last_ok_at,
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('email', k.email, 'kind', k.kind, 'evidenceUrl', k.evidence_url, 'evidenceQuote', k.evidence_quote, 'checkedAt', k.checked_at) order by k.kind desc, k.email)
      from public.radar_club_contacts k
      where k.club_id = c.id and k.status = 'active' and k.mx_ok and p_now - k.checked_at <= make_interval(days => p_max_age_days)), '[]'::jsonb))
$$;

-- Publiczny odczyt: tylko aktualne kluby (data odczytu serwera dołączona, jak w radar_feed)
create function public.radar_clubs_feed() returns jsonb
language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'serverNow', now(),
    'clubs', coalesce((select jsonb_agg(public.radar_club_json(c, now(), age_days) order by c.name, c.id)
                       from public.radar_clubs c, (select coalesce((value #>> '{}')::int, 45) as age_days from public.radar_settings where key = 'club_max_age_days') s
                       where public.radar_club_live(c, now(), s.age_days)), '[]'::jsonb))
$$;

-- Zgłoszenie błędu/prośba o usunięcie klubu (anonimowo, z ograniczeniem częstotliwości; trafia do administratora)
create function public.radar_report_club(p_club uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = public as
$$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 500 then return false; end if;
  if not exists (select 1 from public.radar_clubs where id = p_club and status in ('published', 'stale')) then return false; end if;
  if (select count(*) from public.radar_club_reports where club_id = p_club and created_at > now() - interval '1 hour') >= 5 then return false; end if;
  insert into public.radar_club_reports (club_id, reason) values (p_club, btrim(p_reason));
  return true;
end
$$;

-- ---------- zadania ----------
-- Kandydat na klub (domena z wyszukiwarki). Zablokowane i już znane domeny pomijamy.
create function public.radar_club_candidate_upsert(p_domain text, p_url text, p_title text, p_city text, p_query text) returns uuid
language plpgsql set search_path = public as
$$
declare d text := lower(p_domain); cid uuid;
begin
  if exists (select 1 from public.radar_blocked_domains where domain = d) or exists (select 1 from public.radar_clubs where domain = d) then return null; end if;
  insert into public.radar_club_candidates (domain, sample_url, sample_title, city_hint, found_query)
  values (d, p_url, left(p_title, 300), p_city, left(p_query, 300))
  on conflict (domain) do update set seen_count = public.radar_club_candidates.seen_count + 1, updated_at = now()
  returning id into cid;
  return cid;
end
$$;

create function public.radar_club_claim_candidates(p_limit integer, p_ttl_seconds integer default 900) returns setof public.radar_club_candidates
language plpgsql set search_path = public as
$$
begin
  return query
  with picked as (
    select c.id from public.radar_club_candidates c
    where c.tries < 3 and (c.state = 'pending' or (c.state = 'claimed' and c.claimed_at < now() - make_interval(secs => p_ttl_seconds)))
      and not exists (select 1 from public.radar_blocked_domains b where b.domain = c.domain)
    order by c.seen_count desc, c.created_at limit p_limit for update of c skip locked)
  update public.radar_club_candidates c set state = 'claimed', tries = c.tries + 1, claimed_at = now(), updated_at = now()
  from picked where c.id = picked.id returning c.*;
end
$$;

create function public.radar_club_candidate_done(p_id uuid, p_state text, p_error text default null) returns void
language sql set search_path = public as
$$ update public.radar_club_candidates set state = p_state, last_error = left(p_error, 300), updated_at = now() where id = p_id $$;

-- p: { domain, name, city, lat, lon, website, recruitmentUrl, publish, contacts[{email,kind,evidenceQuote,evidenceUrl,mxOk}], complete }
-- „complete” = strony kontaktowe pobrano poprawnie, więc adresów nieobecnych w odczycie oznaczamy jako brakujące.
create function public.radar_upsert_club(p jsonb) returns jsonb
language plpgsql set search_path = public as
$$
declare
  existing public.radar_clubs; cid uuid; created boolean := false; st text;
  wants_publish boolean := coalesce((p->>'publish')::boolean, false);
begin
  if exists (select 1 from public.radar_blocked_domains where domain = lower(p->>'domain')) then
    return jsonb_build_object('id', null, 'status', 'blocked', 'created', false);
  end if;
  select * into existing from public.radar_clubs where domain = lower(p->>'domain') for update;
  if existing.id is null then
    created := true; st := case when wants_publish then 'published' else 'pending_review' end;
    insert into public.radar_clubs (domain, name, city, lat, lon, website, recruitment_url, recruitment_seen_at, status, last_checked_at, last_ok_at)
    values (lower(p->>'domain'), left(p->>'name', 160), p->>'city', (p->>'lat')::double precision, (p->>'lon')::double precision, p->>'website',
            p->>'recruitmentUrl', case when p->>'recruitmentUrl' is null then null else now() end, st, now(), now())
    returning id into cid;
  else
    cid := existing.id;
    st := case when existing.status = 'withdrawn' then 'withdrawn'
               when existing.status in ('published', 'stale') and wants_publish then 'published' -- wcześniej zaakceptowany wraca po ponownym potwierdzeniu
               when existing.status in ('published', 'stale') then existing.status
               when wants_publish then 'published' else 'pending_review' end;
    update public.radar_clubs set name = left(p->>'name', 160), city = coalesce(p->>'city', city), lat = coalesce((p->>'lat')::double precision, lat),
      lon = coalesce((p->>'lon')::double precision, lon), website = p->>'website',
      recruitment_url = p->>'recruitmentUrl', recruitment_seen_at = case when p->>'recruitmentUrl' is null then recruitment_seen_at else now() end,
      status = st, last_checked_at = now(), last_ok_at = now(), consecutive_failures = 0, updated_at = now() where id = cid;
  end if;

  insert into public.radar_club_contacts (club_id, email, kind, evidence_quote, evidence_url, mx_ok, status, checked_at)
  select cid, lower(x->>'email'), coalesce(x->>'kind', 'general'), left(x->>'evidenceQuote', 400), x->>'evidenceUrl', coalesce((x->>'mxOk')::boolean, false), 'active', now()
  from jsonb_array_elements(coalesce(p->'contacts', '[]')) x
  on conflict (club_id, email) do update set kind = excluded.kind, evidence_quote = excluded.evidence_quote, evidence_url = excluded.evidence_url,
    mx_ok = excluded.mx_ok, status = 'active', checked_at = now();
  if coalesce((p->>'complete')::boolean, false) then
    update public.radar_club_contacts set status = 'missing'
      where club_id = cid and lower(email) not in (select lower(x->>'email') from jsonb_array_elements(coalesce(p->'contacts', '[]')) x);
  end if;
  return jsonb_build_object('id', cid, 'status', st, 'created', created);
end
$$;

create function public.radar_due_clubs(p_limit integer) returns setof public.radar_clubs
language sql stable set search_path = public as
$$ select * from public.radar_clubs where status in ('published', 'stale') and next_check_at <= now() order by next_check_at limit p_limit $$;

-- Wynik ponownego sprawdzenia klubu; błędy wydłużają odstęp, po 3 kolejnych klub przestaje być pokazywany („stale”).
create function public.radar_club_mark(p_id uuid, p_ok boolean, p_error text default null, p_days integer default 14) returns void
language plpgsql set search_path = public as
$$
begin
  update public.radar_clubs set
    last_checked_at = now(), last_ok_at = case when p_ok then now() else last_ok_at end,
    consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
    next_check_at = now() + make_interval(days => p_days * (1 + least(case when p_ok then 0 else consecutive_failures + 1 end, 3))),
    status = case when not p_ok and consecutive_failures + 1 >= 3 and status = 'published' then 'stale' else status end,
    review_note = case when p_ok then review_note else left(p_error, 300) end, updated_at = now()
  where id = p_id;
end
$$;

-- Potwierdzenie (albo brak) jednego adresu na stronie, z której pochodzi; tylko poprawne sprawdzenie odnawia checked_at.
create function public.radar_club_contact_check(p_club uuid, p_email text, p_present boolean) returns void
language sql set search_path = public as
$$
  update public.radar_club_contacts set status = case when p_present then 'active' else 'missing' end, checked_at = case when p_present then now() else checked_at end
  where club_id = p_club and lower(email) = lower(p_email)
$$;

-- ---------- akcje administratora (INVOKER + jawna kontrola roli) ----------
create function public.radar_admin_set_club(p_id uuid, p_action text, p_reason text default null) returns void
language plpgsql set search_path = public as
$$
begin
  if not public.radar_is_admin() then raise exception 'brak uprawnień'; end if;
  if p_action = 'publish' then
    update public.radar_clubs set status = 'published', review_note = null, withdrawn_reason = null where id = p_id and status <> 'withdrawn';
  elsif p_action = 'reject' or p_action = 'withdraw' then
    -- wycofany klub trafia na listę zablokowanych domen i nie wraca z wyszukiwarki
    update public.radar_clubs set status = 'withdrawn', withdrawn_reason = left(p_reason, 500) where id = p_id;
    insert into public.radar_blocked_domains (domain, reason) select domain, left(p_reason, 300) from public.radar_clubs where id = p_id on conflict (domain) do nothing;
  else raise exception 'nieznana akcja';
  end if;
end
$$;

-- radar_expire: dodatkowo klubom bez świeżo potwierdzonego adresu odbieramy publikację (status „stale”; wraca po ponownym potwierdzeniu)
create or replace function public.radar_expire(p_now timestamptz default now()) returns jsonb
language plpgsql set search_path = public as
$$
declare n integer; c integer; age_days integer;
begin
  update public.radar_listings l set status = 'expired', updated_at = p_now
  where l.status = 'published' and not public.radar_listing_live(l, p_now);
  get diagnostics n = row_count;
  select coalesce((value #>> '{}')::int, 45) into age_days from public.radar_settings where key = 'club_max_age_days';
  update public.radar_clubs k set status = 'stale', updated_at = p_now
  where k.status = 'published' and not public.radar_club_live(k, p_now, coalesce(age_days, 45));
  get diagnostics c = row_count;
  update public.radar_urls set state = 'failed', last_error = 'przeterminowane w kolejce', updated_at = p_now where state = 'claimed' and claimed_at < p_now - interval '1 day';
  return jsonb_build_object('expired', n, 'clubsStale', c, 'at', p_now);
end
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'radar_club_candidate_upsert(text,text,text,text,text)', 'radar_club_claim_candidates(integer,integer)', 'radar_club_candidate_done(uuid,text,text)',
    'radar_upsert_club(jsonb)', 'radar_due_clubs(integer)', 'radar_club_mark(uuid,boolean,text,integer)', 'radar_club_contact_check(uuid,text,boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['radar_clubs_feed()', 'radar_report_club(uuid,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.radar_admin_set_club(uuid,text,text) from public, anon';
  execute 'grant execute on function public.radar_admin_set_club(uuid,text,text) to authenticated, service_role';
  execute 'revoke all on function public.radar_expire(timestamptz) from public, anon, authenticated';
  execute 'grant execute on function public.radar_expire(timestamptz) to service_role';
end
$$;
