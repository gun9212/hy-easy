-- Feedback students send from the app. It is anonymous: no user id or email is stored, so the operator reading it
-- on the admin page cannot tell who wrote it. Signed-in school users may only add rows; only admins read them and
-- mark them read.
create table public.feedback(
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  -- The screen the feedback was sent from, like "/postings"; helps place a bug report without naming the sender.
  page text check (page is null or char_length(page) <= 100),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index feedback_latest on public.feedback(created_at desc);
alter table public.feedback enable row level security;

revoke all on public.feedback from anon, authenticated;
grant insert (message, page) on public.feedback to authenticated;
grant select, update (read_at) on public.feedback to authenticated;
grant all on public.feedback to service_role;

create policy school_insert on public.feedback for insert to authenticated
  with check ((select public.is_school_user()));
create policy admin_read on public.feedback for select to authenticated
  using ((select public.is_admin()));
create policy admin_mark_read on public.feedback for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
