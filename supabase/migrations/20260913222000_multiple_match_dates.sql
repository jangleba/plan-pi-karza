alter table public.athlete_profiles
  add column if not exists match_dates date[] not null default '{}';

update public.athlete_profiles
set match_dates = array[match_date]
where match_date is not null and cardinality(match_dates) = 0;

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_match_dates_limit;
alter table public.athlete_profiles
  add constraint athlete_profiles_match_dates_limit
  check (cardinality(match_dates) <= 2);

alter table public.weekly_transitions
  add column if not exists next_match_dates date[] not null default '{}';

update public.weekly_transitions
set next_match_dates = array[next_match_date]
where next_match_date is not null and cardinality(next_match_dates) = 0;

alter table public.weekly_transitions
  drop constraint if exists weekly_transitions_match_dates_limit;
alter table public.weekly_transitions
  add constraint weekly_transitions_match_dates_limit
  check (cardinality(next_match_dates) <= 2);
