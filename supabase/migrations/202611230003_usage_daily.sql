-- Daily usage for the admin page: new sign-ups per day (from auth.users) and students who opened the app per day.
-- Supabase keeps no sign-in history, so visits are recorded here from now on: one row per student per KST day,
-- written when a signed-in page loads. Rows go with the account (cascade) and are kept 180 days.
create table public.activity_days(
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (day, user_id)
);
alter table public.activity_days enable row level security;
revoke all on public.activity_days from anon, authenticated;
grant all on public.activity_days to service_role;
-- No policies: students write only through touch_activity(); admins read counts through admin_usage_daily().

create function public.touch_activity() returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not public.is_school_user() then return; end if;
  insert into public.activity_days(user_id, day) values (auth.uid(), today) on conflict do nothing;
  -- Retention: the first visit of a day also drops rows older than 180 days.
  if found then delete from public.activity_days where day < today - 180; end if;
end; $$;
revoke all on function public.touch_activity() from public, anon, authenticated;
grant execute on function public.touch_activity() to authenticated;

-- Counts per KST day for the last p_days days (today included), oldest first. Verified school accounts only.
create function public.admin_usage_daily(p_days integer default 30)
returns table(day date, signups integer, active integer)
language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  return query
  select d::date,
    (select count(*)::integer from auth.users u
      where (u.created_at at time zone 'Asia/Seoul')::date = d::date
        and u.email ~* '^[^@[:space:]]+@hanyang\.ac\.kr$' and u.email_confirmed_at is not null),
    (select count(*)::integer from public.activity_days a where a.day = d::date)
  from generate_series(today - (least(greatest(p_days, 1), 180) - 1), today, interval '1 day') d
  order by 1;
end; $$;
revoke all on function public.admin_usage_daily(integer) from public, anon, authenticated;
grant execute on function public.admin_usage_daily(integer) to authenticated;
