-- Allow deleting an auth.users account that previously edited classifications without losing
-- the manual classification override or its audit trail (editor_id becomes null on delete).
do $$
declare
  rec record;
begin
  for rec in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.conrelid in ('public.classification_overrides'::regclass, 'public.classification_audit'::regclass)
      and a.attname = 'editor_id'
  loop
    execute format('alter table %s drop constraint %I', rec.tbl, rec.conname);
  end loop;
end $$;

alter table public.classification_overrides
  alter column editor_id drop not null,
  add constraint classification_overrides_editor_id_fkey
    foreign key (editor_id) references auth.users(id) on delete set null;

alter table public.classification_audit
  alter column editor_id drop not null,
  add constraint classification_audit_editor_id_fkey
    foreign key (editor_id) references auth.users(id) on delete set null;
