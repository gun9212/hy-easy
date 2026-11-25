-- Enforce the 2,000-character limit on the raw stored feedback text as well as rejecting blank/whitespace-only text.
do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'c'
      and c.conrelid = 'public.feedback'::regclass
      and a.attname = 'message'
  loop
    execute format('alter table public.feedback drop constraint %I', rec.conname);
  end loop;
end $$;

alter table public.feedback
  add constraint feedback_message_length_check
  check (char_length(btrim(message)) >= 1 and char_length(message) <= 2000);
