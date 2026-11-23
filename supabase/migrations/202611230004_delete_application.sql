-- Allow verified school users to delete their own application record and its event history.
create function public.delete_application(p_posting uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_school_user() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.applications where user_id = auth.uid() and posting_id = p_posting;
  delete from public.application_events where user_id = auth.uid() and posting_id = p_posting;
end; $$;

revoke all on function public.delete_application(uuid) from public, anon, authenticated;
grant execute on function public.delete_application(uuid) to authenticated;
