-- Separate 180-day activity_days retention purge from student visits so expired rows are deleted
-- on schedule even when no student opens the app.
create or replace function public.touch_activity() returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not public.is_school_user() then return; end if;
  insert into public.activity_days(user_id, day) values (auth.uid(), today) on conflict do nothing;
end; $$;
revoke all on function public.touch_activity() from public, anon, authenticated;
grant execute on function public.touch_activity() to authenticated;

create function public.purge_expired_activity_days(p_retention_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  keep_days integer := greatest(coalesce(p_retention_days, 180), 1);
  deleted_count integer;
begin
  delete from public.activity_days where day < today - keep_days;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end; $$;
revoke all on function public.purge_expired_activity_days(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_activity_days(integer) to service_role;
