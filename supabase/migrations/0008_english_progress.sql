-- Piłkarski angielski: postęp nauki zalogowanego użytkownika (poziom, ukończone lekcje, etap powtórek zwrotów i fiszek, miejsce przerwania).
-- To dane edukacyjne (nie zdrowotne): nie podlegają zgodzie na synchronizację zdrowia, ale są objęte eksportem i usunięciem konta.
-- Jeden wiersz = jeden element postępu; konflikty z kilku urządzeń rozstrzyga znacznik czasu `ts` w danych (nowszy wygrywa – po stronie klienta).

create table public.english_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  item text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, item),
  constraint english_item_format check (item ~ '^(level|resume|lesson:[a-z0-9-]{1,40}|phrase:[a-z0-9-]{1,40}|card:[a-z0-9-]{1,40})$'),
  -- coalesce: CHECK przepuszcza NULL, więc brak pola ts musi dawać fałsz
  constraint english_data_shape check (coalesce(jsonb_typeof(data), '') = 'object' and coalesce(jsonb_typeof(data->'ts'), '') = 'number' and pg_column_size(data) <= 4096)
);
alter table public.english_progress enable row level security;

-- Dostęp wyłącznie do własnych wierszy; user_id nie da się podstawić (with check).
create policy "english own select" on public.english_progress for select using (auth.uid() = user_id);
create policy "english own insert" on public.english_progress for insert with check (auth.uid() = user_id);
create policy "english own update" on public.english_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "english own delete" on public.english_progress for delete using (auth.uid() = user_id);

-- Walidacja kształtu i limit liczby elementów (ochrona przed zapisywaniem dowolnych danych na koncie).
create function public.english_progress_guard() returns trigger
language plpgsql set search_path = public as
$$
declare allowed text[]; k text;
begin
  new.updated_at := now();
  if coalesce(jsonb_typeof(new.data), '') <> 'object' then raise exception 'dane muszą być obiektem'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.english_progress where user_id = new.user_id) >= 400 then
    raise exception 'za dużo elementów postępu';
  end if;
  if new.item = 'level' then
    allowed := array['value', 'ts'];
    if (new.data->>'value') is null or (new.data->>'value') not in ('1', '2', '3') then raise exception 'nieprawidłowy poziom'; end if;
  elsif new.item = 'resume' then
    allowed := array['session', 'ts'];
    if not (new.data ? 'session') then raise exception 'brak sesji'; end if;
  elsif new.item like 'lesson:%' then
    allowed := array['completedAt', 'completions', 'firstTry', 'ts'];
    if coalesce(new.data->>'completedAt', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'nieprawidłowa data ukończenia'; end if;
  else
    allowed := array['stage', 'due', 'lastDay', 'dayOk', 'seen', 'correct', 'wrong', 'ts'];
    if coalesce(new.data->>'stage', '') !~ '^[0-5]$' then raise exception 'nieprawidłowy etap'; end if;
    if coalesce(new.data->>'due', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'nieprawidłowy termin'; end if;
    if coalesce(new.data->>'lastDay', 'x') !~ '^(\d{4}-\d{2}-\d{2})?$' then raise exception 'nieprawidłowy dzień'; end if;
  end if;
  for k in select jsonb_object_keys(new.data) loop
    if not (k = any (allowed)) then raise exception 'pole spoza kontraktu: %', k; end if;
  end loop;
  return new;
end
$$;
create trigger english_progress_guard before insert or update on public.english_progress
  for each row execute function public.english_progress_guard();

-- Eksport i usunięcie konta obejmują także ten magazyn.
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
  foreach t in array array['english_progress', 'paid_access', 'guardian_confirmations', 'consent_events', 'agreement_events', 'age_declarations', 'check_ins', 'weight_log', 'mas_tests', 'profiles'] loop
    execute format('delete from public.%I where user_id = $1', t) using p_user;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  update public.account_deletion_log set status = 'data_erased', steps = counts where id = lid;
  return jsonb_build_object('logId', lid, 'deleted', counts);
end
$$;
