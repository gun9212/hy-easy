-- Speeds up reads under row-level security.
-- The read policies called is_school_user() / is_admin() once per row. Both are security-definer functions, so
-- Postgres cannot inline them: listing 500 collector runs or sorting every posting version ran the check 500+
-- times. Wrapped in a scalar subquery the check runs once per query (an InitPlan); who may read what is unchanged.
do $$ declare t text; begin
  foreach t in array array['companies','postings','classifications','classification_overrides'] loop
    execute format('alter policy school_read on public.%I using ((select public.is_school_user()))', t);
  end loop;
  foreach t in array array['posting_versions','classification_audit','collector_runs','classification_queue'] loop
    execute format('alter policy admin_read on public.%I using ((select public.is_admin()))', t);
  end loop;
end $$;

-- The admin page lists the latest runs, source changes and edits; without these indexes each list sorts the table.
create index if not exists collector_runs_latest on public.collector_runs(started_at desc);
create index if not exists posting_versions_latest on public.posting_versions(captured_at desc);
create index if not exists classification_audit_latest on public.classification_audit(edited_at desc);
