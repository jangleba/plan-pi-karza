-- BallWise jako PWA: role i uprawnienia (oferta indywidualna, klub, prowadzenie LoadWise), zapis wykonania treningów
-- z kolejki offline (idempotentnie, z rozstrzyganiem konfliktów), wiadomości od trenera i subskrypcje powiadomień.
--
-- Zasady:
--  * jedno konto zawodnika; uprawnienia (entitlements) są osobnymi wierszami: 'ballwise' (indywidualnie), 'club', 'loadwise',
--  * trener widzi WYŁĄCZNIE zawodników przypisanych do niego (coach_assignments) i tylko dopóki zawodnik ma aktywną usługę,
--    z której wynika to przypisanie (LoadWise albo klub, w którym trener jest w sztabie),
--  * zapis wykonania to dane treningowe: jak dziennik ciężarów wymaga zgody 'health_sync' (bez zgody zostaje na urządzeniu),
--  * nadawanie uprawnień i przypisań: tylko administrator aplikacji lub service_role (np. po płatności), nie klient.

-- 1. Kluby i sztab -------------------------------------------------------------------------------------------------------
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.club_staff (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'coach')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- 2. Uprawnienia zawodnika ---------------------------------------------------------------------------------------------------
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('ballwise', 'loadwise', 'club')),
  club_id uuid references public.clubs(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  source text not null default 'manual' check (source in ('manual', 'payment', 'club', 'trial')),
  created_at timestamptz not null default now(),
  constraint entitlement_club check ((product = 'club') = (club_id is not null)),
  constraint entitlement_period check (valid_until is null or valid_until > valid_from)
);
create index entitlements_user on public.entitlements (user_id, product);

create function public.has_entitlement(p_user uuid, p_product text, p_club uuid default null) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.entitlements e
                  where e.user_id = p_user and e.product = p_product and (p_club is null or e.club_id = p_club)
                    and e.valid_from <= now() and (e.valid_until is null or e.valid_until > now())) $$;

-- 3. Przypisanie trenera do zawodnika ------------------------------------------------------------------------------------
create table public.coach_assignments (
  coach_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('loadwise', 'club')),
  club_id uuid references public.clubs(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (coach_id, player_id, scope),
  constraint assignment_club check ((scope = 'club') = (club_id is not null)),
  constraint assignment_not_self check (coach_id <> player_id)
);
create index coach_assignments_player on public.coach_assignments (player_id);

-- Czy bieżący użytkownik jest trenerem tego zawodnika TERAZ: aktywne przypisanie + aktywna usługa zawodnika,
-- a dla klubu dodatkowo trener nadal w sztabie tego klubu. Wygaśnięcie usługi automatycznie odcina dostęp.
create function public.is_coach_of(p_player uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select auth.uid() is not null and exists (
     select 1 from public.coach_assignments a
     where a.coach_id = auth.uid() and a.player_id = p_player and a.active
       and ((a.scope = 'loadwise' and public.has_entitlement(p_player, 'loadwise'))
         or (a.scope = 'club' and public.has_entitlement(p_player, 'club', a.club_id)
             and exists (select 1 from public.club_staff s where s.club_id = a.club_id and s.user_id = auth.uid())))) $$;

-- Pomocnik bez rekurencji RLS (zasada na club_staff nie może odpytywać club_staff bezpośrednio).
create function public.is_club_staff(p_club uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.club_staff s where s.club_id = p_club and s.user_id = auth.uid()) $$;

alter table public.clubs enable row level security;
alter table public.club_staff enable row level security;
alter table public.entitlements enable row level security;
alter table public.coach_assignments enable row level security;

create policy "club visible to staff and members" on public.clubs for select using (
  public.is_club_staff(clubs.id) or public.has_entitlement(auth.uid(), 'club', clubs.id) or public.is_app_admin());
create policy "staff sees own club staff" on public.club_staff for select using (
  user_id = auth.uid() or public.is_club_staff(club_id) or public.is_app_admin());
create policy "own entitlements" on public.entitlements for select using (user_id = auth.uid() or public.is_app_admin());
create policy "assignments of me" on public.coach_assignments for select using (coach_id = auth.uid() or player_id = auth.uid() or public.is_app_admin());
-- zapis: tylko administrator (service_role omija RLS); klient nie nada sobie uprawnień ani nie przypisze trenera
create policy "admin clubs" on public.clubs for all using (public.is_app_admin()) with check (public.is_app_admin());
create policy "admin staff" on public.club_staff for all using (public.is_app_admin()) with check (public.is_app_admin());
create policy "admin entitlements" on public.entitlements for all using (public.is_app_admin()) with check (public.is_app_admin());
create policy "admin assignments" on public.coach_assignments for all using (public.is_app_admin()) with check (public.is_app_admin());

-- 4. Wykonanie treningów -----------------------------------------------------------------------------------------------------
create table public.session_logs (
  id uuid primary key, -- nadawany na urządzeniu = klucz idempotencji
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  session_key text not null check (session_key ~ '^[a-z][a-z_]{1,23}$'),
  status text not null check (status in ('done', 'partial')),
  sets_done integer not null check (sets_done between 0 and 500),
  sets_total integer not null check (sets_total between 0 and 500),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_s integer not null check (duration_s between 0 and 21600),
  client_updated_at timestamptz not null,
  replaced jsonb, -- poprzedni zapis tego samego treningu z innego urządzenia (przejrzystość rozstrzygnięcia konfliktu)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_one_per_day unique (user_id, day, session_key),
  constraint session_sets check (sets_done <= sets_total),
  constraint session_times check (finished_at >= started_at)
);
alter table public.session_logs enable row level security;
create policy "own session logs" on public.session_logs for select using (user_id = auth.uid());
create policy "coach reads assigned session logs" on public.session_logs for select using (public.is_coach_of(user_id));
create policy "own session logs delete" on public.session_logs for delete using (user_id = auth.uid());
-- wstawianie i zmiana wyłącznie przez record_session_log (walidacja, idempotencja, konflikty)

-- Ranking zapisów tego samego treningu z dwóch urządzeń: pełne wykonanie > więcej serii > późniejsze zakończenie.
create function public.session_rank(p_status text, p_sets integer, p_finished timestamptz) returns numeric
language sql immutable as
$$ select (case when p_status = 'done' then 1 else 0 end) * 1e15 + least(p_sets, 500) * 1e12 + extract(epoch from p_finished) $$;

create function public.record_session_log(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  u uuid := auth.uid();
  v_id uuid; v_day date; v_key text; v_status text; v_done integer; v_total integer;
  v_start timestamptz; v_end timestamptz; v_dur integer; v_cu timestamptz;
  cur public.session_logs%rowtype;
begin
  if u is null then raise exception 'wymagane zalogowanie' using errcode = '28000'; end if;
  if not public.has_consent('health_sync', u) then raise exception 'brak zgody na synchronizację' using errcode = 'P0001', hint = 'no_consent'; end if;
  begin
    v_id := (p->>'id')::uuid; v_day := (p->>'day')::date; v_key := p->>'sessionKey'; v_status := p->>'status';
    v_done := (p->>'setsDone')::integer; v_total := (p->>'setsTotal')::integer;
    v_start := (p->>'startedAt')::timestamptz; v_end := (p->>'finishedAt')::timestamptz;
    v_dur := (p->>'durationS')::integer; v_cu := (p->>'clientUpdatedAt')::timestamptz;
  exception when others then raise exception 'nieprawidłowy zapis treningu' using errcode = '22023';
  end;
  if v_id is null or v_day is null or v_key is null or v_status is null or v_end is null or v_cu is null then raise exception 'niepełny zapis treningu' using errcode = '22023'; end if;
  if v_day > (now() at time zone 'utc')::date + 1 or v_day < (now() at time zone 'utc')::date - 400 then raise exception 'data treningu poza zakresem' using errcode = '22023'; end if;
  if v_cu > now() + interval '1 day' or v_end > now() + interval '1 day' then raise exception 'czas z przyszłości – sprawdź zegar urządzenia' using errcode = '22023'; end if;

  -- jeden zawodnik, jeden trening dnia: zapisy z kilku kart/urządzeń przechodzą po kolei
  perform pg_advisory_xact_lock(hashtextextended(u::text || v_day::text || v_key, 0));

  select * into cur from public.session_logs where id = v_id;
  if found then
    if cur.user_id <> u then raise exception 'identyfikator zajęty' using errcode = '42501'; end if;
    if v_cu > cur.client_updated_at then
      update public.session_logs set status = v_status, sets_done = v_done, sets_total = v_total, started_at = v_start, finished_at = v_end,
        duration_s = v_dur, client_updated_at = v_cu, updated_at = now() where id = v_id;
      return jsonb_build_object('outcome', 'updated', 'id', v_id);
    end if;
    return jsonb_build_object('outcome', 'duplicate', 'id', v_id); -- ponowna wysyłka tego samego: nic nie zmieniamy
  end if;

  select * into cur from public.session_logs where user_id = u and day = v_day and session_key = v_key;
  if found then
    if public.session_rank(v_status, v_done, v_end) > public.session_rank(cur.status, cur.sets_done, cur.finished_at) then
      update public.session_logs set id = v_id, status = v_status, sets_done = v_done, sets_total = v_total, started_at = v_start, finished_at = v_end,
        duration_s = v_dur, client_updated_at = v_cu, updated_at = now(),
        replaced = jsonb_build_object('id', cur.id, 'status', cur.status, 'setsDone', cur.sets_done, 'setsTotal', cur.sets_total, 'finishedAt', cur.finished_at)
      where id = cur.id;
      return jsonb_build_object('outcome', 'replaced', 'id', v_id);
    end if;
    return jsonb_build_object('outcome', 'kept_server', 'id', cur.id);
  end if;

  insert into public.session_logs (id, user_id, day, session_key, status, sets_done, sets_total, started_at, finished_at, duration_s, client_updated_at)
  values (v_id, u, v_day, v_key, v_status, v_done, v_total, v_start, v_end, v_dur, v_cu);
  return jsonb_build_object('outcome', 'inserted', 'id', v_id);
end
$$;
revoke all on function public.record_session_log(jsonb) from public, anon;
grant execute on function public.record_session_log(jsonb) to authenticated;

-- 5. Wiadomości od trenera ---------------------------------------------------------------------------------------------------
create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'message' check (kind in ('message', 'plan_change')),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index coach_messages_player on public.coach_messages (player_id, created_at desc);
alter table public.coach_messages enable row level security;
create policy "player reads own messages" on public.coach_messages for select using (player_id = auth.uid());
create policy "coach reads own sent messages" on public.coach_messages for select using (coach_id = auth.uid() and public.is_coach_of(player_id));
create policy "coach writes to assigned player" on public.coach_messages for insert
  with check (coach_id = auth.uid() and public.is_coach_of(player_id) and read_at is null);

create function public.mark_coach_message_read(p_id uuid) returns void
language sql security definer set search_path = public as
$$ update public.coach_messages set read_at = coalesce(read_at, now()) where id = p_id and player_id = auth.uid() $$;
revoke all on function public.mark_coach_message_read(uuid) from public, anon;
grant execute on function public.mark_coach_message_read(uuid) to authenticated;

-- Lista zawodników trenera: tylko imię i pozycja z profilu (bez reszty profilu), ostatni trening, nieprzeczytane.
create function public.coach_players() returns table (player_id uuid, name text, player_position text, scope text, club text, last_day date, last_status text, last_sets text, sessions_7d integer, unread integer)
language sql stable security definer set search_path = public as
$$
  select a.player_id,
         coalesce(nullif(p.data->>'name', ''), 'Zawodnik'),
         p.data->>'position',
         a.scope,
         c.name,
         l.day, l.status, case when l.id is null then null else l.sets_done || '/' || l.sets_total end,
         (select count(*)::integer from public.session_logs s where s.user_id = a.player_id and s.day >= current_date - 6),
         (select count(*)::integer from public.coach_messages m where m.player_id = a.player_id and m.coach_id = auth.uid() and m.read_at is null)
  from public.coach_assignments a
  left join public.profiles p on p.user_id = a.player_id
  left join public.clubs c on c.id = a.club_id
  left join lateral (select * from public.session_logs s where s.user_id = a.player_id order by s.day desc, s.finished_at desc limit 1) l on true
  where a.coach_id = auth.uid() and public.is_coach_of(a.player_id)
  order by 2
$$;
revoke all on function public.coach_players() from public, anon;
grant execute on function public.coach_players() to authenticated;

-- 6. Powiadomienia push ----------------------------------------------------------------------------------------------------
create table public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  topics text[] not null default array['message', 'plan_change', 'reminder'] check (topics <@ array['message', 'plan_change', 'reminder']),
  reminder_hour smallint check (reminder_hour between 5 and 22),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "own push select" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "own push delete" on public.push_subscriptions for delete using (user_id = auth.uid());

-- To samo urządzenie po zmianie konta: subskrypcja przechodzi na bieżące konto (poprzednie konto nie dostaje już powiadomień na ten telefon).
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_topics text[] default null, p_reminder_hour smallint default null) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is null then raise exception 'wymagane zalogowanie'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, topics, reminder_hour)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, coalesce(p_topics, array['message', 'plan_change', 'reminder']), p_reminder_hour)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    topics = excluded.topics, reminder_hour = excluded.reminder_hour, last_seen_at = now();
end
$$;
revoke all on function public.save_push_subscription(text, text, text, text[], smallint) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text[], smallint) to authenticated;

-- 7. Zgoda, eksport i usunięcie konta obejmują nowe dane --------------------------------------------------------------------
create or replace function public.record_consent(p_purpose text, p_action text, p_version text) returns void
language plpgsql set search_path = public as
$$
begin
  insert into public.consent_events (user_id, purpose, action, doc_version) values (auth.uid(), p_purpose, p_action, p_version);
  if p_action = 'withdraw' and p_purpose = 'health_sync' then
    delete from public.check_ins where user_id = auth.uid();
    delete from public.weight_log where user_id = auth.uid();
    delete from public.mas_tests where user_id = auth.uid();
    delete from public.session_logs where user_id = auth.uid();
  end if;
end
$$;

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
    'sessionLogs', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.day) from public.session_logs s where s.user_id = u), '[]'),
    'coachMessages', coalesce((select jsonb_agg(jsonb_build_object('kind', m.kind, 'body', m.body, 'createdAt', m.created_at, 'readAt', m.read_at) order by m.created_at) from public.coach_messages m where m.player_id = u), '[]'),
    'entitlements', coalesce((select jsonb_agg(jsonb_build_object('product', e.product, 'validFrom', e.valid_from, 'validUntil', e.valid_until, 'source', e.source)) from public.entitlements e where e.user_id = u), '[]'),
    'coachAssignments', coalesce((select jsonb_agg(jsonb_build_object('scope', a.scope, 'active', a.active, 'createdAt', a.created_at)) from public.coach_assignments a where a.player_id = u), '[]'),
    'pushSubscriptions', (select count(*) from public.push_subscriptions s where s.user_id = u),
    'englishProgress', coalesce((select jsonb_agg(jsonb_build_object('item', e.item, 'data', e.data, 'updatedAt', e.updated_at) order by e.item) from public.english_progress e where e.user_id = u), '[]'),
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
  delete from public.coach_messages where player_id = p_user or coach_id = p_user;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('coach_messages', n);
  delete from public.coach_assignments where player_id = p_user or coach_id = p_user;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('coach_assignments', n);
  foreach t in array array['push_subscriptions', 'session_logs', 'entitlements', 'club_staff', 'english_progress', 'paid_access', 'guardian_confirmations', 'consent_events', 'agreement_events', 'age_declarations', 'check_ins', 'weight_log', 'mas_tests', 'profiles'] loop
    execute format('delete from public.%I where user_id = $1', t) using p_user;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  update public.account_deletion_log set status = 'data_erased', steps = counts where id = lid;
  return jsonb_build_object('logId', lid, 'deleted', counts);
end
$$;
