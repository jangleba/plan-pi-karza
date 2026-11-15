-- BallWise is offered from 16. New accounts below 16 can not complete onboarding.
-- Accounts that already completed onboarding (including existing 13-15 guardian-owned accounts)
-- keep their profile, plan and history and can still be edited; nothing is deleted.
create or replace function public.enforce_new_account_minimum_age()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Service/admin operations (migrations, account handover) are not onboarding.
  if auth.uid() is null then return new; end if;
  if new.onboarding_completed is true
     and (tg_op = 'INSERT' or old.onboarding_completed is not true)
     and new.birth_date is not null
     and extract(year from age(current_date, new.birth_date))::integer < 16 then
    raise exception 'BallWise jest dostępny od 16 lat' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists profiles_new_account_minimum_age on public.profiles;
create trigger profiles_new_account_minimum_age
  before insert or update of onboarding_completed, birth_date on public.profiles
  for each row execute function public.enforce_new_account_minimum_age();
