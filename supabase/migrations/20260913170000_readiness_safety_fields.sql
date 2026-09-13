alter table public.readiness_logs
  add column if not exists pain_onset text,
  add column if not exists alters_movement boolean not null default false,
  add column if not exists red_flags text[] not null default '{}';

alter table public.readiness_logs
  drop constraint if exists readiness_logs_pain_onset_check;

alter table public.readiness_logs
  add constraint readiness_logs_pain_onset_check
  check (pain_onset is null or pain_onset in ('today', '1_7_days', 'over_7_days'));

alter table public.readiness_logs
  drop constraint if exists readiness_logs_red_flags_check;

alter table public.readiness_logs
  add constraint readiness_logs_red_flags_check
  check (
    red_flags <@ array[
      'chest_pain',
      'fainting',
      'breathlessness',
      'head_injury',
      'deformity_or_no_weight'
    ]::text[]
  );

comment on column public.readiness_logs.red_flags is
  'Closed safety signals only. Never place free-text medical notes here.';
