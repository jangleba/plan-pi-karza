-- BallWise Lab stores only derived measurements and frame references.
-- Raw videos remain on-device and are deleted after the user saves a result.
create table if not exists public.lab_test_results (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  test_id text not null check (
    test_id in (
      'cmj',
      'single_leg_cmj',
      'sprint_10m',
      'flying_10m',
      'cod_505',
      'sprint_10m_ball'
    )
  ),
  side text check (side is null or side in ('left', 'right')),
  trial_number smallint not null check (trial_number between 1 and 10),
  recorded_at timestamptz not null,
  fps numeric not null check (fps >= 239 and fps <= 1000 and fps <> 'NaN'::numeric),
  frame_count integer not null check (frame_count > 1),
  first_frame integer not null check (first_frame >= 0),
  second_frame integer not null check (second_frame > first_frame),
  trim_start_frame integer not null check (trim_start_frame >= 0),
  trim_end_frame integer not null,
  first_guide_position numeric not null check (
    first_guide_position >= 0
    and first_guide_position <= 1
    and first_guide_position <> 'NaN'::numeric
  ),
  second_guide_position numeric not null check (
    second_guide_position >= 0
    and second_guide_position <= 1
    and second_guide_position <> 'NaN'::numeric
  ),
  guide_axis text not null check (guide_axis in ('horizontal', 'vertical')),
  primary_value numeric not null check (primary_value > 0 and primary_value <> 'NaN'::numeric),
  primary_unit text not null check (primary_unit in ('cm', 's')),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  quality jsonb not null check (jsonb_typeof(quality) = 'object'),
  protocol_version text not null,
  created_at timestamptz not null default now(),
  constraint lab_test_results_frames_in_range check (
    trim_end_frame > trim_start_frame
    and trim_end_frame < frame_count
    and first_frame >= trim_start_frame
    and second_frame <= trim_end_frame
  ),
  constraint lab_test_results_side_matches_test check (
    (test_id in ('single_leg_cmj', 'cod_505') and side in ('left', 'right'))
    or (test_id not in ('single_leg_cmj', 'cod_505') and side is null)
  )
);

create index if not exists lab_test_results_user_recorded_idx
  on public.lab_test_results (user_id, recorded_at desc);

create index if not exists lab_test_results_user_batch_idx
  on public.lab_test_results (user_id, batch_id);

alter table public.lab_test_results enable row level security;
alter table public.lab_test_results force row level security;

revoke all on table public.lab_test_results from anon;
revoke all on table public.lab_test_results from authenticated;
grant select, insert, delete on table public.lab_test_results to authenticated;
grant all on table public.lab_test_results to service_role;

drop policy if exists "lab results select own" on public.lab_test_results;
create policy "lab results select own"
  on public.lab_test_results
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "lab results insert own" on public.lab_test_results;
create policy "lab results insert own"
  on public.lab_test_results
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "lab results delete own" on public.lab_test_results;
create policy "lab results delete own"
  on public.lab_test_results
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.lab_test_results is
  'Derived BallWise Lab measurements from user-selected frames; no raw video is stored.';
