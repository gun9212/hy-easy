-- Append-only ledger of every AI classification call (including re-classifications that overwrite
-- public.classifications) so monthly token and USD spend remain accurate.
create table public.classification_calls (
  id bigint generated always as identity primary key,
  posting_id uuid references public.postings(id) on delete set null,
  input_hash text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  taxonomy_version text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric not null default 0,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  source text not null default 'collector' check (source in ('collector', 'queue_script', 'backfill')),
  called_at timestamptz not null default now()
);

create index classification_calls_called_at on public.classification_calls(called_at desc);
-- Deleting a posting sets posting_id to null here; the index keeps that from scanning the whole ledger.
create index classification_calls_posting_id on public.classification_calls(posting_id);

alter table public.classification_calls enable row level security;
revoke all on public.classification_calls from public, anon, authenticated;
grant all on public.classification_calls to service_role;
grant all on sequence public.classification_calls_id_seq to service_role;

-- Backfill existing latest classifications once so prior known spend is preserved in the ledger.
insert into public.classification_calls (
  posting_id, input_hash, provider, model, prompt_version, taxonomy_version,
  input_tokens, output_tokens, cost_usd, status, source, called_at
)
select
  posting_id, input_hash, provider, model, prompt_version, taxonomy_version,
  input_tokens, output_tokens, cost_usd, 'succeeded', 'backfill', created_at
from public.classifications;

-- Admin-only monthly AI usage and estimated USD spend in KST (includes overwritten re-classifications).
create function public.admin_ai_cost_monthly(p_months integer default 6)
returns table(
  month text,
  calls bigint,
  failed_calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  cost_usd numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_months integer := greatest(1, least(coalesce(p_months, 6), 24));
  v_start timestamptz := (date_trunc('month', now() at time zone 'Asia/Seoul') - make_interval(months => v_months - 1)) at time zone 'Asia/Seoul';
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with months as (
    select to_char(d, 'YYYY-MM') as month
    from generate_series(
      date_trunc('month', now() at time zone 'Asia/Seoul') - make_interval(months => v_months - 1),
      date_trunc('month', now() at time zone 'Asia/Seoul'),
      interval '1 month'
    ) as d
  ),
  agg as (
    select
      to_char(c.called_at at time zone 'Asia/Seoul', 'YYYY-MM') as month,
      count(*) as calls,
      count(*) filter (where c.status = 'failed') as failed_calls,
      coalesce(sum(c.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(c.output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(c.cost_usd), 0)::numeric as cost_usd
    from public.classification_calls c
    where c.called_at >= v_start
    group by 1
  )
  select
    m.month,
    coalesce(a.calls, 0)::bigint,
    coalesce(a.failed_calls, 0)::bigint,
    coalesce(a.input_tokens, 0)::bigint,
    coalesce(a.output_tokens, 0)::bigint,
    coalesce(a.cost_usd, 0)::numeric
  from months m
  left join agg a on a.month = m.month
  order by m.month desc;
end $$;

revoke all on function public.admin_ai_cost_monthly(integer) from public, anon, authenticated;
grant execute on function public.admin_ai_cost_monthly(integer) to authenticated;
