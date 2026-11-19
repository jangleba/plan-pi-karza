-- Ballwise: prywatność, konto, dowody oświadczeń, potwierdzenia opiekuna, eksport/usuwanie.
-- Zasady: (1) serwer przechowuje minimum – nigdy pełnej daty urodzenia; (2) oświadczenia są dziennikiem zdarzeń (append-only);
-- (3) status potwierdzenia opiekuna zmienia wyłącznie funkcja serwerowa, nie użytkownik; (4) dane zdrowotne idą do chmury tylko po
-- odwoływalnej zgodzie, egzekwowanej przez RLS; (5) NIE jest to ogólna zgoda „na RODO” ani weryfikacja tożsamości.

-- ---------- 1. kontrakt profilu: tylko dozwolone pola, wiek >= 16, brak pól daty urodzenia ----------
create function public.profile_contract_check() returns trigger
language plpgsql set search_path = public as
$$
declare
  allowed text[] := array['name','season','goal','goal2','league','age','ageAsOf','strengthYears','weightKg','position','equipment','clubWeekdays','matchWeekdays','offWeekdays','limitedGymAccess','startDate'];
  forbidden text[] := array['birthDate','birthYear','dob','dateOfBirth','birthday'];
  k text;
begin
  if jsonb_typeof(new.data) <> 'object' then raise exception 'profil musi być obiektem'; end if;
  for k in select jsonb_object_keys(new.data) loop
    if k = any (forbidden) then raise exception 'pole % nie może być zapisane na serwerze (data urodzenia zostaje na urządzeniu)', k; end if;
    if not (k = any (allowed)) then raise exception 'pole % jest poza kontraktem profilu', k; end if;
  end loop;
  if jsonb_typeof(new.data->'age') <> 'number' or (new.data->>'age')::numeric <> trunc((new.data->>'age')::numeric)
     or (new.data->>'age')::int < 16 or (new.data->>'age')::int > 110 then
    raise exception 'wiek poniżej 16 lat lub nieprawidłowy – profil nie może zostać zapisany';
  end if;
  return new;
end
$$;
create trigger profiles_contract before insert or update on public.profiles for each row execute function public.profile_contract_check();

-- ---------- 2. deklaracja grupy wieku (samodeklaracja, nie weryfikacja tożsamości) ----------
create table public.age_declarations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  band text not null check (band in ('16-17', '18+')), -- poniżej 16 lat nie przyjmujemy żadnych danych
  method text not null default 'self_declared' check (method = 'self_declared'),
  declared_at timestamptz not null default now()
);
create index age_declarations_user_idx on public.age_declarations (user_id, declared_at desc);

create function public.declare_age_band(p_band text) returns void
language sql set search_path = public as
$$ insert into public.age_declarations (user_id, band) values (auth.uid(), p_band) $$;

create function public.current_age_band(p_user uuid default auth.uid()) returns text
language sql stable security definer set search_path = public as
$$ select band from public.age_declarations where user_id = p_user order by declared_at desc, id desc limit 1 $$;

-- ---------- 3. dowody oświadczeń: umowa, zasady bezpieczeństwa (osobno), zgody na konkretne przetwarzanie ----------
create table public.agreement_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('terms', 'safety')), -- warunki umowy / potwierdzenie zapoznania się z zasadami bezpieczeństwa
  doc_version text not null check (length(doc_version) between 1 and 40),
  method text not null default 'checkbox' check (method in ('checkbox')),
  recorded_at timestamptz not null default now()
);
create index agreement_events_user_idx on public.agreement_events (user_id, kind, recorded_at desc);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('health_sync')), -- synchronizacja danych o samopoczuciu, masie ciała i wynikach z chmurą
  action text not null check (action in ('grant', 'withdraw')),
  doc_version text not null check (length(doc_version) between 1 and 40),
  method text not null default 'toggle' check (method in ('toggle')),
  recorded_at timestamptz not null default now()
);
create index consent_events_user_idx on public.consent_events (user_id, purpose, recorded_at desc);

create function public.record_agreement(p_kind text, p_version text) returns void
language sql set search_path = public as
$$ insert into public.agreement_events (user_id, kind, doc_version) values (auth.uid(), p_kind, p_version) $$;

create function public.has_agreement(p_kind text, p_version text, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.agreement_events where user_id = p_user and kind = p_kind and doc_version = p_version) $$;

-- Aktualna zgoda = ostatnie zdarzenie dla celu to „grant”.
create function public.has_consent(p_purpose text, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select action = 'grant' from public.consent_events where user_id = p_user and purpose = p_purpose order by recorded_at desc, id desc limit 1), false) $$;

-- Wycofanie zgody ma rzeczywisty skutek: usuwa dane serwerowe objęte tym celem (RLS: tylko własne wiersze).
create function public.record_consent(p_purpose text, p_action text, p_version text) returns void
language plpgsql set search_path = public as
$$
begin
  insert into public.consent_events (user_id, purpose, action, doc_version) values (auth.uid(), p_purpose, p_action, p_version);
  if p_action = 'withdraw' and p_purpose = 'health_sync' then
    delete from public.check_ins where user_id = auth.uid();
    delete from public.weight_log where user_id = auth.uid();
    delete from public.mas_tests where user_id = auth.uid();
  end if;
end
$$;

-- Dane zdrowotne: odczyt i usuwanie własnych zawsze; zapis tylko przy aktualnej zgodzie.
drop policy "own mas" on public.mas_tests;
drop policy "own weights" on public.weight_log;
drop policy "own check-ins" on public.check_ins;
create policy "own mas select" on public.mas_tests for select using (auth.uid() = user_id);
create policy "own mas delete" on public.mas_tests for delete using (auth.uid() = user_id);
create policy "own mas write" on public.mas_tests for insert with check (auth.uid() = user_id and public.has_consent('health_sync'));
create policy "own mas update" on public.mas_tests for update using (auth.uid() = user_id) with check (auth.uid() = user_id and public.has_consent('health_sync'));
create policy "own weights select" on public.weight_log for select using (auth.uid() = user_id);
create policy "own weights delete" on public.weight_log for delete using (auth.uid() = user_id);
create policy "own weights write" on public.weight_log for insert with check (auth.uid() = user_id and public.has_consent('health_sync'));
create policy "own weights update" on public.weight_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id and public.has_consent('health_sync'));
create policy "own check-ins select" on public.check_ins for select using (auth.uid() = user_id);
create policy "own check-ins delete" on public.check_ins for delete using (auth.uid() = user_id);
create policy "own check-ins write" on public.check_ins for insert with check (auth.uid() = user_id and public.has_consent('health_sync'));
create policy "own check-ins update" on public.check_ins for update using (auth.uid() = user_id) with check (auth.uid() = user_id and public.has_consent('health_sync'));

alter table public.age_declarations enable row level security;
alter table public.agreement_events enable row level security;
alter table public.consent_events enable row level security;
create policy "own age declarations select" on public.age_declarations for select using (auth.uid() = user_id);
create policy "own age declarations insert" on public.age_declarations for insert with check (auth.uid() = user_id);
create policy "own agreements select" on public.agreement_events for select using (auth.uid() = user_id);
create policy "own agreements insert" on public.agreement_events for insert with check (auth.uid() = user_id);
create policy "own consents select" on public.consent_events for select using (auth.uid() = user_id);
create policy "own consents insert" on public.consent_events for insert with check (auth.uid() = user_id);
-- brak polityk UPDATE/DELETE = dziennik tylko do dopisywania (usuwa go dopiero usunięcie konta)

-- ---------- 4. potwierdzenie przez opiekuna dla osób 16–17 lat (umowa, np. płatna subskrypcja) ----------
create table public.guardian_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_version text not null check (length(contract_version) between 1 and 40),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'revoked')),
  token_hash text not null unique, -- sha256 jednorazowego tokenu; sam token pokazujemy raz
  revoke_token_hash text unique,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  confirmed_method text check (confirmed_method in ('token_link')),
  revoked_at timestamptz
);
create index guardian_conf_user_idx on public.guardian_confirmations (user_id, requested_at desc);
alter table public.guardian_confirmations enable row level security;
-- brak jakichkolwiek polityk: użytkownik nie może ani czytać (hashe), ani zmieniać tabeli; wszystko przez funkcje poniżej

create function public.sha256_hex(t text) returns text language sql immutable as
$$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

-- 4a. Prośba (użytkownik 16–17): wynik zawiera token JEDEN raz; przekazuje go opiekunowi sam (bez zbierania danych opiekuna).
create function public.request_guardian_confirmation(p_contract_version text, p_ttl_hours integer default 72) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare tok text; ttl integer := least(greatest(coalesce(p_ttl_hours, 72), 1), 168); exp timestamptz;
begin
  if auth.uid() is null then raise exception 'wymagane zalogowanie'; end if;
  if public.current_age_band(auth.uid()) is distinct from '16-17' then raise exception 'potwierdzenie opiekuna nie jest wymagane dla tej grupy wieku'; end if;
  update public.guardian_confirmations set status = 'revoked', revoked_at = now()
    where user_id = auth.uid() and contract_version = p_contract_version and status = 'pending';
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  exp := now() + make_interval(hours => ttl);
  insert into public.guardian_confirmations (user_id, contract_version, token_hash, expires_at) values (auth.uid(), p_contract_version, public.sha256_hex(tok), exp);
  return jsonb_build_object('token', tok, 'expiresAt', exp);
end
$$;

-- 4b. Podgląd dla opiekuna (bez danych o osobie: tylko wersja warunków i ważność).
create function public.guardian_info(p_token text) returns jsonb
language sql stable security definer set search_path = public as
$$
  select coalesce((select jsonb_build_object('valid', status = 'pending' and expires_at > now(), 'contractVersion', contract_version, 'expiresAt', expires_at)
                   from public.guardian_confirmations where token_hash = public.sha256_hex(p_token)), jsonb_build_object('valid', false))
$$;

-- 4c. Potwierdzenie. Wymaga: ważny token, zgodna wersja warunków, wyraźne oświadczenie opiekuna. Sesja osoby, której dotyczy prośba,
-- nie może potwierdzić własnej prośby. (Uwaga: to deklaracja opiekuna, a nie weryfikacja tożsamości.)
create function public.guardian_confirm(p_token text, p_contract_version text, p_attested boolean) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare r public.guardian_confirmations; rtok text;
begin
  if not coalesce(p_attested, false) then raise exception 'wymagane oświadczenie opiekuna'; end if;
  select * into r from public.guardian_confirmations where token_hash = public.sha256_hex(p_token) for update;
  if r.id is null then raise exception 'nieprawidłowy token'; end if;
  if r.status <> 'pending' then raise exception 'token został już wykorzystany lub unieważniony'; end if;
  if r.expires_at <= now() then raise exception 'token wygasł'; end if;
  if r.contract_version <> p_contract_version then raise exception 'inna wersja warunków niż w prośbie'; end if;
  if auth.uid() is not null and auth.uid() = r.user_id then raise exception 'osoba, której dotyczy umowa, nie może sama jej potwierdzić'; end if;
  rtok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.guardian_confirmations set status = 'confirmed', confirmed_at = now(), confirmed_method = 'token_link', revoke_token_hash = public.sha256_hex(rtok) where id = r.id;
  return jsonb_build_object('confirmed', true, 'revokeToken', rtok);
end
$$;

-- 4d. Cofnięcie przez opiekuna (osobny token pokazywany raz przy potwierdzeniu).
create function public.guardian_revoke(p_revoke_token text) returns boolean
language plpgsql security definer set search_path = public as
$$
declare r public.guardian_confirmations; n integer;
begin
  select * into r from public.guardian_confirmations where revoke_token_hash = public.sha256_hex(p_revoke_token) and status = 'confirmed';
  if r.id is null then return false; end if;
  -- Cofnięcie dotyczy umowy w danej wersji, a nie pojedynczego wiersza: żadne wcześniejsze potwierdzenie tej samej wersji nie może zostać w mocy.
  update public.guardian_confirmations set status = 'revoked', revoked_at = now()
    where user_id = r.user_id and contract_version = r.contract_version and status = 'confirmed';
  get diagnostics n = row_count;
  return n > 0;
end
$$;

-- 4e. Stan dla użytkownika (bez hashów): none | pending | confirmed | revoked | expired.
create function public.guardian_state(p_contract_version text) returns jsonb
language sql stable security definer set search_path = public as
$$
  select coalesce((
    select jsonb_build_object('state', case when status = 'pending' and expires_at <= now() then 'expired' else status end,
                              'requestedAt', requested_at, 'expiresAt', expires_at, 'confirmedAt', confirmed_at, 'revokedAt', revoked_at)
    from public.guardian_confirmations where user_id = auth.uid() and contract_version = p_contract_version order by (status = 'confirmed') desc, requested_at desc limit 1),
    jsonb_build_object('state', 'none'))
$$;

-- ---------- 5. dostęp płatny: nigdy bez wymaganego potwierdzenia opiekuna ----------
create table public.paid_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null,
  status text not null default 'active' check (status in ('active', 'canceled')),
  contract_version text not null,
  provider_ref text,
  activated_at timestamptz not null default now(),
  canceled_at timestamptz
);
alter table public.paid_access enable row level security;
create policy "own paid access select" on public.paid_access for select using (auth.uid() = user_id);
-- brak polityk zapisu: aktywuje wyłącznie funkcja serwerowa (webhook dostawcy płatności po jego wdrożeniu)

create function public.activate_paid_access(p_user uuid, p_plan text, p_contract_version text, p_provider_ref text) returns void
language plpgsql security definer set search_path = public as
$$
declare band text := public.current_age_band(p_user);
begin
  if band is null then raise exception 'age_declaration_required'; end if;
  if not public.has_agreement('terms', p_contract_version, p_user) then raise exception 'terms_not_accepted'; end if;
  if band = '16-17' and not exists (
       select 1 from public.guardian_confirmations where user_id = p_user and contract_version = p_contract_version and status = 'confirmed') then
    raise exception 'guardian_confirmation_required';
  end if;
  insert into public.paid_access (user_id, plan, contract_version, provider_ref) values (p_user, p_plan, p_contract_version, p_provider_ref)
  on conflict (user_id) do update set plan = excluded.plan, contract_version = excluded.contract_version, provider_ref = excluded.provider_ref, status = 'active', activated_at = now(), canceled_at = null;
end
$$;

-- ---------- 6. eksport i usuwanie ----------
-- Dziennik realizacji usunięcia: bez danych osobowych (pseudonimowy skrót identyfikatora), by móc wykazać, że usunięcie wykonano.
create table public.account_deletion_log (
  id uuid primary key default gen_random_uuid(),
  user_hash text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'data_erased', 'completed', 'failed')),
  steps jsonb not null default '{}'
);
alter table public.account_deletion_log enable row level security;
create policy "radar admin deletion log" on public.account_deletion_log for select using (public.radar_is_admin());

-- Eksport WŁASNYCH danych (zakres: wszystkie tabele użytkownika; bez hashów tokenów).
create function public.export_my_data() returns jsonb
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
    'paidAccess', (select to_jsonb(p) - 'user_id' from public.paid_access p where p.user_id = u),
    'radarSaved', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id') from public.radar_saved s where s.user_id = u), '[]'));
end
$$;

-- Usunięcie danych użytkownika ze WSZYSTKICH tabel (wywołuje wyłącznie funkcja serwerowa delete-account po zweryfikowaniu sesji).
-- Idempotentne: ponowne wywołanie po częściowej awarii dokańcza usuwanie. Konto w auth.users usuwa Edge Function przez API administracyjne.
create function public.erase_user_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare counts jsonb := '{}'; n integer; t text; lid uuid;
begin
  insert into public.account_deletion_log (user_hash, status) values (public.sha256_hex(p_user::text), 'started') returning id into lid;
  foreach t in array array['radar_saved', 'paid_access', 'guardian_confirmations', 'consent_events', 'agreement_events', 'age_declarations', 'check_ins', 'weight_log', 'mas_tests', 'profiles'] loop
    execute format('delete from public.%I where user_id = $1', t) using p_user;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  update public.account_deletion_log set status = 'data_erased', steps = counts where id = lid;
  return jsonb_build_object('logId', lid, 'deleted', counts);
end
$$;

create function public.finish_account_deletion(p_log uuid, p_ok boolean) returns void
language sql security definer set search_path = public as
$$ update public.account_deletion_log set status = case when p_ok then 'completed' else 'failed' end, completed_at = case when p_ok then now() else null end where id = p_log $$;

-- ---------- 7. bezpieczne uporządkowanie ewentualnych dat urodzenia, które mogły trafić do profili (wymaga administratora) ----------
-- Krok 1: audyt (tylko liczby). Krok 2: dry-run (domyślnie). Krok 3: po kopii zapasowej uruchom z p_dry_run => false.
create function public.profiles_birth_audit() returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  if not public.radar_is_admin() then raise exception 'brak uprawnień'; end if;
  return jsonb_build_object(
    'profilesTotal', (select count(*) from public.profiles),
    'withBirthFields', (select count(*) from public.profiles where data ?| array['birthDate','birthYear','dob','dateOfBirth','birthday']),
    'underMinAge', (select count(*) from public.profiles where jsonb_typeof(data->'age') = 'number' and (data->>'age')::numeric < 16));
end
$$;

create function public.strip_profile_birth_fields(p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare n integer;
begin
  if not public.radar_is_admin() then raise exception 'brak uprawnień'; end if;
  select count(*) into n from public.profiles where data ?| array['birthDate','birthYear','dob','dateOfBirth','birthday'];
  if p_dry_run then return jsonb_build_object('dryRun', true, 'wouldUpdate', n, 'note', 'Nic nie zmieniono. Zrób kopię zapasową i wywołaj z p_dry_run => false.'); end if;
  update public.profiles set data = data - 'birthDate' - 'birthYear' - 'dob' - 'dateOfBirth' - 'birthday' where data ?| array['birthDate','birthYear','dob','dateOfBirth','birthday'];
  return jsonb_build_object('dryRun', false, 'updated', n);
end
$$;

-- ---------- 8. uprawnienia ----------
do $$
declare f text;
begin
  foreach f in array array['declare_age_band(text)', 'record_agreement(text,text)', 'record_consent(text,text,text)', 'request_guardian_confirmation(text,integer)',
                           'guardian_state(text)', 'export_my_data()', 'current_age_band(uuid)', 'has_agreement(text,text,uuid)', 'has_consent(text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['guardian_info(text)', 'guardian_confirm(text,text,boolean)', 'guardian_revoke(text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
  foreach f in array array['activate_paid_access(uuid,text,text,text)', 'erase_user_data(uuid)', 'finish_account_deletion(uuid,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['profiles_birth_audit()', 'strip_profile_birth_fields(boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end
$$;
