-- Canonical role privileges for the public schema.
-- Run after `pg_restore --no-owner --no-privileges` (see docs/BACKUP.md) to restore every REVOKE and GRANT
-- across all migrations. Safe to re-run; keep in sync with supabase/migrations/*.sql (checked by CI).
begin;

grant usage on schema public to anon, authenticated, service_role;

-- Clear default PUBLIC/role privileges first so no table, sequence, or SECURITY DEFINER function
-- (especially collector-only functions) keeps default EXECUTE or table access after a dump/restore.
revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;
end $$;

-- Authenticated students and admins (row access is further restricted by RLS policies).
grant select on
  public.companies,
  public.postings,
  public.posting_view,
  public.classifications,
  public.classification_overrides,
  public.posting_versions,
  public.classification_audit,
  public.collector_runs,
  public.classification_queue,
  public.admins,
  public.applications,
  public.application_events
to authenticated;

grant select, insert, delete on public.favorites to authenticated;
grant insert (message, page) on public.feedback to authenticated;
grant select, update (read_at) on public.feedback to authenticated;

grant execute on function
  public.is_school_user(),
  public.is_admin(),
  public.record_application(uuid, text),
  public.delete_application(uuid),
  public.override_classification(uuid, jsonb),
  public.retry_classification(uuid),
  public.admin_user_stats(),
  public.touch_activity(),
  public.admin_usage_daily(integer),
  public.admin_ai_cost_monthly(integer)
to authenticated;

-- Collector and server-side service role.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function
  public.acquire_collector_lock(uuid),
  public.release_collector_lock(uuid),
  public.sync_posting(jsonb, text, text),
  public.touch_postings(jsonb),
  public.mark_detail_checked(text, text)
to service_role;

commit;
