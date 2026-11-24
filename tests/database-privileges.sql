-- Role privilege verification for restored or freshly migrated databases.
-- Runs inside a rolled-back transaction and does not modify auth.* so it is safe on restored production dumps too.
begin;

create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then
    raise exception 'PRIVILEGE ASSERTION FAILED: %', message;
  end if;
end $$;

-- 1. Catalog audit: PUBLIC and anon must have zero privileges on any public table/view/sequence/function.
select pg_temp.assert(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p')
      and (
        has_table_privilege('public', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      )
  ),
  'public and anon must have no privileges on any public table or view'
);

select pg_temp.assert(
  not exists (
    select 1
    from pg_sequences s
    where s.schemaname = 'public'
      and (
        has_sequence_privilege('public', format('%I.%I', s.schemaname, s.sequencename), 'USAGE,SELECT,UPDATE')
        or has_sequence_privilege('anon', format('%I.%I', s.schemaname, s.sequencename), 'USAGE,SELECT,UPDATE')
        or has_sequence_privilege('authenticated', format('%I.%I', s.schemaname, s.sequencename), 'USAGE,SELECT,UPDATE')
      )
  ),
  'public, anon, and authenticated must have no privileges on public sequences'
);

select pg_temp.assert(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
      and (
        has_function_privilege('public', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
      )
  ),
  'public and anon must have no EXECUTE privilege on any public function'
);

-- 2. Exact function EXECUTE sets for authenticated and service_role.
select pg_temp.assert(
  (
    select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), array[]::text[])
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) = array[
    'admin_usage_daily(integer)',
    'admin_user_stats()',
    'delete_application(uuid)',
    'is_admin()',
    'is_school_user()',
    'override_classification(uuid,jsonb)',
    'record_application(uuid,text)',
    'retry_classification(uuid)',
    'touch_activity()'
  ],
  'authenticated EXECUTE set must match the exact 9 app/admin functions'
);

select pg_temp.assert(
  (
    select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), array[]::text[])
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) = array[
    'acquire_collector_lock(uuid)',
    'mark_detail_checked(text,text)',
    'release_collector_lock(uuid)',
    'sync_posting(jsonb,text,text)',
    'touch_postings(jsonb)'
  ],
  'service_role EXECUTE set must match the exact 5 collector functions'
);

-- 3. Exact table and column privilege matrix for authenticated and service_role.
select pg_temp.assert(
  (
    select coalesce(array_agg(c.relname::text order by c.relname::text), array[]::text[])
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p')
      and has_table_privilege('authenticated', c.oid, 'SELECT')
  ) = array[
    'admins',
    'application_events',
    'applications',
    'classification_audit',
    'classification_overrides',
    'classification_queue',
    'classifications',
    'collector_runs',
    'companies',
    'favorites',
    'feedback',
    'posting_versions',
    'posting_view',
    'postings'
  ],
  'authenticated SELECT tables/views must match the expected list'
);

select pg_temp.assert(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('collector_locks', 'collector_state', 'activity_days')
      and has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'authenticated must have zero access to collector_locks, collector_state, and activity_days'
);

select pg_temp.assert(
  has_table_privilege('authenticated', 'public.favorites', 'SELECT,INSERT,DELETE')
  and not has_table_privilege('authenticated', 'public.favorites', 'UPDATE'),
  'authenticated favorites grants must be SELECT, INSERT, DELETE only'
);

select pg_temp.assert(
  has_column_privilege('authenticated', 'public.feedback', 'message', 'INSERT')
  and has_column_privilege('authenticated', 'public.feedback', 'page', 'INSERT')
  and not has_column_privilege('authenticated', 'public.feedback', 'read_at', 'INSERT')
  and has_column_privilege('authenticated', 'public.feedback', 'read_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.feedback', 'message', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.feedback', 'DELETE'),
  'authenticated feedback grants must stay column-scoped without DELETE'
);

select pg_temp.assert(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p')
      and c.relname not in ('favorites', 'feedback')
      and has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
  ),
  'authenticated must not have direct write access on read-only tables'
);

select pg_temp.assert(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'service_role must have full access to all base tables in public'
);

select pg_temp.assert(
  not exists (
    select 1
    from pg_sequences s
    where s.schemaname = 'public'
      and not has_sequence_privilege('service_role', format('%I.%I', s.schemaname, s.sequencename), 'USAGE,SELECT,UPDATE')
  ),
  'service_role must have full access to all sequences in public'
);

-- 4. Runtime role checks: anon, authenticated (student/admin guards), and service_role (collector).
set local role anon;
do $$ begin
  begin perform * from public.postings limit 1; raise exception 'anon read postings succeeded'; exception when insufficient_privilege then null; end;
  begin perform * from public.posting_view limit 1; raise exception 'anon read posting_view succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.is_school_user(); raise exception 'anon is_school_user succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.is_admin(); raise exception 'anon is_admin succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.acquire_collector_lock('00000000-0000-4000-8000-000000000099'); raise exception 'anon acquire_collector_lock succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.sync_posting('{}'::jsonb, 'h', 'c'); raise exception 'anon sync_posting succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.touch_postings('[]'::jsonb); raise exception 'anon touch_postings succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.mark_detail_checked('x', 'y'); raise exception 'anon mark_detail_checked succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.admin_user_stats(); raise exception 'anon admin_user_stats succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
do $$ begin
  begin perform public.acquire_collector_lock('00000000-0000-4000-8000-000000000099'); raise exception 'authenticated acquire_collector_lock succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.release_collector_lock('00000000-0000-4000-8000-000000000099'); raise exception 'authenticated release_collector_lock succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.sync_posting('{}'::jsonb, 'h', 'c'); raise exception 'authenticated sync_posting succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.touch_postings('[]'::jsonb); raise exception 'authenticated touch_postings succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.mark_detail_checked('x', 'y'); raise exception 'authenticated mark_detail_checked succeeded'; exception when insufficient_privilege then null; end;
  begin perform * from public.activity_days limit 1; raise exception 'authenticated activity_days read succeeded'; exception when insufficient_privilege then null; end;
  begin perform * from public.collector_locks limit 1; raise exception 'authenticated collector_locks read succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.admin_user_stats(); raise exception 'non-admin admin_user_stats succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.admin_usage_daily(7); raise exception 'non-admin admin_usage_daily succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.retry_classification(); raise exception 'non-admin retry_classification succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role service_role;
select pg_temp.assert(public.touch_postings('[]'::jsonb) = 0, 'service_role can execute touch_postings');
select pg_temp.assert(
  public.acquire_collector_lock('00000000-0000-4000-8000-000000000099') in (true, false),
  'service_role can execute acquire_collector_lock'
);
select public.release_collector_lock('00000000-0000-4000-8000-000000000099');
reset role;

rollback;
select 'Database role privilege assertions passed' as result;
