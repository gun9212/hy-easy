-- List-based change detection: a detail page is re-read only when its list row changed
-- (status, deadline, stipend, counts other than applicants) or the last detail read is older than 24h.
alter table public.postings
  add column list_hash text,
  add column detail_checked_at timestamptz;

-- Updates unchanged rows from the list page: live applicant count and last-checked time only.
-- Content hash and version history are untouched, so applicant churn creates no versions.
create function public.touch_postings(p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare touched integer;
begin
  update public.postings p
     set last_checked_at = now(),
         document = jsonb_set(p.document, '{applicants}', coalesce(i.value->'applicants', 'null'::jsonb))
    from jsonb_array_elements(p_items) i
   where p.source_id = i.value->>'source_id';
  get diagnostics touched = row_count;
  return touched;
end; $$;

-- Records that a detail page was read for the given list row state.
create function public.mark_detail_checked(p_source_id text, p_list_hash text) returns void
language sql security definer set search_path = '' as $$
  update public.postings set list_hash = p_list_hash, detail_checked_at = now() where source_id = p_source_id;
$$;

revoke all on function public.touch_postings(jsonb), public.mark_detail_checked(text, text) from public, anon, authenticated;
grant execute on function public.touch_postings(jsonb), public.mark_detail_checked(text, text) to service_role;
