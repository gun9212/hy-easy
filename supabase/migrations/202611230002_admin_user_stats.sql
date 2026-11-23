-- How many students use the service, for the admin page. auth.users is not readable through the API, so an
-- admin-only security-definer function returns counts only, never emails or ids. Only verified school accounts
-- count; accounts turned away at sign-in (another domain) are left out.
create function public.admin_user_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  return (
    select jsonb_build_object(
      'total', count(*),
      'active7d', count(*) filter (where u.last_sign_in_at > now() - interval '7 days'),
      'new7d', count(*) filter (where u.created_at > now() - interval '7 days')
    )
    from auth.users u
    where u.email ~* '^[^@[:space:]]+@hanyang\.ac\.kr$' and u.email_confirmed_at is not null
  );
end; $$;
revoke all on function public.admin_user_stats() from public, anon, authenticated;
grant execute on function public.admin_user_stats() to authenticated;
