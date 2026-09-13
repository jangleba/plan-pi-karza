alter table public.athlete_profiles
  add column if not exists fuel_allergy_status text not null default 'unconfirmed',
  add column if not exists food_allergies text[] not null default '{}',
  add column if not exists food_intolerances text[] not null default '{}',
  add column if not exists food_exclusions text[] not null default '{}';

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_fuel_allergy_status_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_fuel_allergy_status_check
  check (fuel_allergy_status in ('unconfirmed', 'confirmed_none', 'has_allergies'));

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_fuel_allergies_consistency_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_fuel_allergies_consistency_check
  check (
    (fuel_allergy_status = 'has_allergies' and cardinality(food_allergies) > 0)
    or (fuel_allergy_status <> 'has_allergies' and cardinality(food_allergies) = 0)
  );

comment on column public.athlete_profiles.food_exclusions is
  'User-selected exclusions only; do not infer or store religion or medical diagnosis.';
