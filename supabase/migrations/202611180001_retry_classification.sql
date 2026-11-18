-- Lets an admin give queued postings another classification try from the admin page, instead of running SQL.
-- With a posting id it resets that one row; without one it resets every row that has used up attempts.
-- Only the retry count and last error change: the input hash stays, so the collector classifies the same text.
create function public.retry_classification(p_posting uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare reset_count integer;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  update public.classification_queue
     set attempts = 0, last_error = null, updated_at = now()
   where attempts > 0 and (p_posting is null or posting_id = p_posting);
  get diagnostics reset_count = row_count;
  return reset_count;
end; $$;
revoke all on function public.retry_classification(uuid) from public, anon, authenticated;
grant execute on function public.retry_classification(uuid) to authenticated;
