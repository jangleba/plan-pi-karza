-- Radar: rozdzielenie „strona zaktualizowana” od „potwierdzone przez organizatora” (audyt, sekcja 8).
--  * page_updated_at: data aktualizacji STRONY podana na stronie (informacja; nie przedłuża ważności naboru bezterminowego),
--  * organizer_confirmed_at + organizer_confirmation: jawne potwierdzenie aktualności przez organizatora z dowodem
--    (oświadczenie na stronie z cytatem albo kontakt zapisany przez administratora z notatką).
-- Dotychczasowe wartości organizer_confirmed_at mogły pochodzić z daty aktualizacji strony, więc bez dowodu NIE są traktowane jako
-- potwierdzenie: przenosimy je do page_updated_at i zerujemy potwierdzenie. Skutek: bezterminowe nabory wymagają ponownego,
-- jawnego potwierdzenia (inaczej wygasają po 7 dniach). To celowo ostrożne i jednorazowe.

alter table public.radar_listings add column page_updated_at timestamptz;
alter table public.radar_listings add column organizer_confirmation jsonb;

update public.radar_listings set page_updated_at = organizer_confirmed_at, organizer_confirmed_at = null
  where organizer_confirmed_at is not null and organizer_confirmation is null;

alter table public.radar_listings add constraint radar_confirmed_needs_evidence
  check (organizer_confirmed_at is null or (organizer_confirmation is not null and length(coalesce(organizer_confirmation->>'evidence', '')) > 0
         and organizer_confirmation->>'method' in ('page_statement', 'admin_contact')));

create or replace function public.radar_listing_json(l public.radar_listings) returns jsonb
language sql stable set search_path = public as
$$
  select jsonb_build_object(
    'id', l.id, 'url', l.url, 'kind', l.kind, 'organizer', l.organizer, 'title', l.title, 'summary', l.summary,
    'city', l.city, 'venue', l.venue, 'lat', l.lat, 'lon', l.lon, 'positions', l.positions,
    'signupMode', l.signup_mode, 'signupStatus', l.signup_status, 'costState', l.cost_state, 'costPln', l.cost_pln,
    'requirementsText', l.requirements_text, 'eligibility', l.eligibility, 'indefinite', l.indefinite,
    'signupClosesAt', l.signup_closes_at, 'publishedAt', l.published_at, 'status', l.status,
    'sourceCheckedAt', l.source_checked_at, 'pageUpdatedAt', l.page_updated_at,
    'organizerConfirmedAt', l.organizer_confirmed_at, 'organizerConfirmation', l.organizer_confirmation,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'date', s.date, 'startTime', nullif(s.start_time, ''), 'startsAt', s.starts_at, 'city', s.city, 'venue', s.venue,
        'lat', s.lat, 'lon', s.lon, 'eligibility', s.eligibility, 'status', s.status) order by s.date, s.start_time)
      from public.radar_sessions s where s.listing_id = l.id), '[]'::jsonb))
$$;

create or replace function public.radar_upsert_listing(p jsonb) returns jsonb
language plpgsql set search_path = public as
$$
declare
  l jsonb := p->'listing';
  existing public.radar_listings;
  lid uuid;
  new_status text;
  created boolean := false;
  changed boolean := false;
  -- „Potwierdzone przez organizatora” wymaga jawnego oświadczenia z dowodem (method + evidence). Sama data aktualizacji strony nim nie jest.
  confm jsonb := case when jsonb_typeof(p->'organizerConfirmation') = 'object' and p->'organizerConfirmation'->>'method' = 'page_statement'
                       and length(coalesce(p->'organizerConfirmation'->>'evidence', '')) > 0 then p->'organizerConfirmation' else null end;
  conf timestamptz := case when confm is not null then nullif(p->>'organizerConfirmedAt', '')::timestamptz else null end;
  page_upd timestamptz := nullif(p->>'pageUpdatedAt', '')::timestamptz;
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
      organizer_confirmed_at, organizer_confirmation, page_updated_at, content_hash)
    values (nullif(p->>'sourceId', '')::uuid, p->>'url', p->>'urlHash', l->>'kind', l->>'organizer', l->>'title', l->>'summary', l->>'city', l->>'venue',
      (l->>'lat')::double precision, (l->>'lon')::double precision, coalesce(l->'positions', '{"scope":"unknown"}'), coalesce(l->>'signupMode', 'unknown'),
      coalesce(l->>'signupStatus', 'unknown'), coalesce(l->>'costState', 'unknown'), (l->>'costPln')::numeric, l->>'requirementsText', nullif(l->'eligibility', 'null'::jsonb),
      coalesce((l->>'indefinite')::boolean, false), nullif(l->>'signupClosesAt', '')::timestamptz, nullif(l->>'publishedAt', '')::timestamptz,
      new_status, coalesce(array(select jsonb_array_elements_text(coalesce(p->'reviewReasons', '[]'))), '{}'), now(), conf, case when conf is not null then confm else null end, page_upd, p->>'contentHash')
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
      organizer_confirmation = case when conf is not null and (organizer_confirmed_at is null or conf > organizer_confirmed_at) then confm else organizer_confirmation end,
      organizer_confirmed_at = case when conf is not null and (organizer_confirmed_at is null or conf > organizer_confirmed_at) then conf else organizer_confirmed_at end,
      page_updated_at = coalesce(page_upd, page_updated_at),
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

-- Akcja „confirm”: administrator zapisuje potwierdzenie z notatką-dowodem (np. „odpowiedź e-mail organizatora z 12.11”); bez notatki odmowa.
create or replace function public.radar_admin_set_listing(p_id uuid, p_action text, p_reason text default null) returns void
language plpgsql set search_path = public as
$$
begin
  if not public.radar_is_admin() then raise exception 'brak uprawnień'; end if;
  if p_action = 'publish' then
    update public.radar_listings set status = 'published', review_reasons = '{}', withdrawn_reason = null, source_checked_at = coalesce(source_checked_at, now()) where id = p_id;
  elsif p_action = 'confirm' then
    if length(btrim(coalesce(p_reason, ''))) < 8 then raise exception 'potwierdzenie organizatora wymaga notatki z dowodem (kto, kiedy, jak)'; end if;
    update public.radar_listings set organizer_confirmed_at = now(),
      organizer_confirmation = jsonb_build_object('method', 'admin_contact', 'evidence', left(btrim(p_reason), 500)) where id = p_id;
  elsif p_action = 'withdraw' then
    update public.radar_listings set status = 'withdrawn', withdrawn_reason = left(p_reason, 500) where id = p_id;
  else raise exception 'nieznana akcja';
  end if;
end
$$;
