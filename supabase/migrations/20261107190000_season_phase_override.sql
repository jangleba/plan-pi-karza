-- BallWise: persist the athlete's deliberate "custom season" choice.
-- The plan engine trusts seasonPhase only when this flag is set; without the
-- column the choice was lost on the next login and the plan silently followed
-- the calendar suggestion instead. Additive and safe to apply at any time:
-- merge_own_profile_row ignores keys for columns that do not exist yet.
alter table public.athlete_profiles
  add column if not exists season_phase_override boolean not null default false;
