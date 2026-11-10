-- All source data is private to verified Hanyang Google identities.
create extension if not exists pgcrypto;

create function public.is_school_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join auth.identities i on i.user_id = u.id
    where u.id = auth.uid() and u.email ~* '^[^@[:space:]]+@hanyang\.ac\.kr$'
      and u.email_confirmed_at is not null and i.provider = 'google'
      and i.identity_data->>'email_verified' = 'true'
      and lower(i.identity_data->>'email') = lower(u.email)
  );
$$;
revoke all on function public.is_school_user() from public;
grant execute on function public.is_school_user() to authenticated;

create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;
create policy admin_own on public.admins for select to authenticated using (user_id = auth.uid() and public.is_school_user());
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_school_user() and exists(select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(), name text not null unique
);
create table public.postings (
  id uuid primary key default gen_random_uuid(), source_id text not null unique,
  company_id uuid not null references public.companies(id),
  document jsonb not null, content_hash text not null, classification_hash text not null,
  first_seen_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_checked_at timestamptz not null default now()
);
create index postings_latest on public.postings(first_seen_at desc);
create index postings_company on public.postings(company_id);
create table public.posting_versions (
  id bigint generated always as identity primary key, posting_id uuid not null references public.postings(id) on delete cascade,
  document jsonb not null, content_hash text not null, captured_at timestamptz not null default now()
);
create table public.classifications (
  posting_id uuid primary key references public.postings(id) on delete cascade,
  result jsonb not null, input_hash text not null, provider text not null, model text not null,
  prompt_version text not null, taxonomy_version text not null,
  input_tokens integer not null default 0, output_tokens integer not null default 0, cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);
create table public.classification_overrides (
  posting_id uuid primary key references public.postings(id) on delete cascade,
  result jsonb not null, input_hash text not null, editor_id uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.classification_audit (
  id bigint generated always as identity primary key, posting_id uuid not null references public.postings(id) on delete cascade,
  result jsonb not null, editor_id uuid not null references auth.users(id), edited_at timestamptz not null default now()
);
create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_id uuid not null references public.postings(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id, posting_id)
);
create table public.applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  posting_id uuid not null references public.postings(id),
  status text not null check (status in ('in_progress','rejection_pending','rejected','accepted','unknown')),
  updated_at timestamptz not null default now(), unique(user_id,posting_id)
);
-- Unknown and accepted states also block a new application. Concurrent writes cannot bypass this.
create unique index one_blocking_application on public.applications(user_id) where status <> 'rejected';
create table public.application_events (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade,
  posting_id uuid not null references public.postings(id), status text not null, recorded_at timestamptz not null default now()
);
create table public.collector_runs (
  id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'running' check(status in ('running','success','partial','failed','session_expired','skipped')),
  checked integer not null default 0, changed integer not null default 0, error_code text
);
create table public.collector_locks (name text primary key, owner uuid not null, expires_at timestamptz not null);
create table public.collector_state (name text primary key, value jsonb not null default '{}');
create table public.classification_queue (
  posting_id uuid primary key references public.postings(id) on delete cascade,
  input_hash text not null, attempts integer not null default 0, last_error text, updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['companies','postings','posting_versions','classifications','classification_overrides','classification_audit','favorites','applications','application_events','collector_runs','collector_locks','collector_state','classification_queue'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
  foreach t in array array['companies','postings','classifications','classification_overrides'] loop
    execute format('create policy school_read on public.%I for select to authenticated using (public.is_school_user())',t);
  end loop;
  foreach t in array array['posting_versions','classification_audit','collector_runs','classification_queue'] loop
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())',t);
  end loop;
end $$;
create policy own_favorites on public.favorites for all to authenticated using(user_id = auth.uid() and public.is_school_user()) with check(user_id = auth.uid() and public.is_school_user());
create policy own_applications_read on public.applications for select to authenticated using(user_id = auth.uid() and public.is_school_user());
create policy own_events_read on public.application_events for select to authenticated using(user_id = auth.uid() and public.is_school_user());

create view public.posting_view with (security_invoker = true) as
select p.id, p.first_seen_at,
  p.document || jsonb_build_object(
    'id',p.id,'firstSeenAt',p.first_seen_at,'updatedAt',p.updated_at,'lastCheckedAt',p.last_checked_at,
    'classification',coalesce(o.result,c.result),
    'classificationSource',case when o.posting_id is not null then 'admin' when c.posting_id is not null then 'ai' else null end,
    'classificationStale',coalesce(coalesce(o.input_hash,c.input_hash) <> p.classification_hash,false)
  ) as document
from public.postings p left join public.classifications c on c.posting_id = p.id left join public.classification_overrides o on o.posting_id = p.id;

create function public.record_application(p_posting uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_school_user() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_status not in ('in_progress','rejection_pending','rejected','accepted','unknown') then raise exception 'invalid status'; end if;
  insert into public.applications(user_id,posting_id,status) values(auth.uid(),p_posting,p_status)
    on conflict(user_id,posting_id) do update set status=excluded.status,updated_at=now();
  insert into public.application_events(user_id,posting_id,status) values(auth.uid(),p_posting,p_status);
end; $$;

create function public.override_classification(p_posting uuid,p_result jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  select classification_hash into strict h from public.postings where id=p_posting;
  insert into public.classification_overrides(posting_id,result,input_hash,editor_id) values(p_posting,p_result,h,auth.uid())
    on conflict(posting_id) do update set result=excluded.result,input_hash=excluded.input_hash,editor_id=excluded.editor_id,updated_at=now();
  insert into public.classification_audit(posting_id,result,editor_id) values(p_posting,p_result,auth.uid());
end; $$;

create function public.acquire_collector_lock(p_owner uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.collector_locks(name,owner,expires_at) values('hywep',p_owner,now()+interval '8 minutes')
    on conflict(name) do update set owner=excluded.owner,expires_at=excluded.expires_at where public.collector_locks.expires_at < now();
  return found;
end; $$;
create function public.release_collector_lock(p_owner uuid) returns void language sql security definer set search_path = '' as $$
  delete from public.collector_locks where name='hywep' and owner=p_owner;
$$;

create function public.sync_posting(p_document jsonb,p_content_hash text,p_classification_hash text) returns boolean language plpgsql security definer set search_path = '' as $$
declare c uuid; existing public.postings%rowtype; v_posting_id uuid; changed boolean;
begin
  insert into public.companies(name) values(p_document->>'company') on conflict(name) do update set name=excluded.name returning id into c;
  select * into existing from public.postings where source_id=p_document->>'sourceId' for update;
  changed := existing.id is null or existing.content_hash <> p_content_hash;
  if existing.id is null then
    insert into public.postings(source_id,company_id,document,content_hash,classification_hash)
      values(p_document->>'sourceId',c,p_document,p_content_hash,p_classification_hash) returning id into v_posting_id;
  else
    v_posting_id := existing.id;
    update public.postings set company_id=c,document=p_document,content_hash=p_content_hash,classification_hash=p_classification_hash,
      updated_at=case when changed then now() else updated_at end,last_checked_at=now() where id=v_posting_id;
  end if;
  if changed then
    insert into public.posting_versions(posting_id,document,content_hash) values(v_posting_id,p_document,p_content_hash);
  end if;
  if existing.id is null or existing.classification_hash <> p_classification_hash then
    insert into public.classification_queue(posting_id,input_hash) values(v_posting_id,p_classification_hash)
      on conflict(posting_id) do update set input_hash=excluded.input_hash,attempts=0,last_error=null,updated_at=now();
  end if;
  return changed;
end; $$;

revoke all on all tables in schema public from anon,authenticated;
grant select on public.companies,public.postings,public.posting_view,public.classifications,public.classification_overrides,public.posting_versions,public.classification_audit,public.collector_runs,public.classification_queue,public.admins,public.applications,public.application_events to authenticated;
grant select,insert,delete on public.favorites to authenticated;
revoke all on function public.record_application(uuid,text),public.override_classification(uuid,jsonb),public.acquire_collector_lock(uuid),public.release_collector_lock(uuid),public.sync_posting(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.record_application(uuid,text),public.override_classification(uuid,jsonb) to authenticated;
grant execute on function public.acquire_collector_lock(uuid),public.release_collector_lock(uuid),public.sync_posting(jsonb,text,text) to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
