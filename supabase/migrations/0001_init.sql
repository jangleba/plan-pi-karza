-- Ballwise: schemat startowy. Każdy wiersz należy do zalogowanego użytkownika (RLS).

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,            -- Profile (wiek, staż, masa, pozycja, sprzęt, dni, startDate)
  updated_at timestamptz not null default now()
);

create table public.mas_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  distance_m integer not null check (distance_m between 500 and 2500),
  tested_on date not null default current_date
);

create table public.weight_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null,
  kg numeric not null check (kg > 0),
  reps integer not null check (reps > 0),
  logged_on date not null,
  next_kg numeric,
  primary key (user_id, exercise_id)
);

create table public.check_ins (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  sleep smallint not null check (sleep between 1 and 3),
  feeling smallint not null check (feeling between 1 and 3),
  less boolean not null default false,
  primary key (user_id, day)
);

alter table public.profiles enable row level security;
alter table public.mas_tests enable row level security;
alter table public.weight_log enable row level security;
alter table public.check_ins enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own mas" on public.mas_tests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own weights" on public.weight_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own check-ins" on public.check_ins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
