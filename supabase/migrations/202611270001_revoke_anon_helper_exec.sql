-- Align live production with supabase/privileges.sql by revoking default PUBLIC and anon
-- EXECUTE privileges from helper functions created in 202611100001_initial.sql.
revoke execute on function public.is_admin(), public.is_school_user() from public, anon;
