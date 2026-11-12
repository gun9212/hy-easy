-- changedAt: the latest change to anything a student sees for a posting (source text, AI classification or an
-- admin override). Browsers keep a copy of the posting list and ask only for postings changed after their copy.
-- last_checked_at is left out on purpose: the collector touches it on every run without changing the posting.
create or replace view public.posting_view with (security_invoker = true) as
select p.id, p.first_seen_at,
  p.document || jsonb_build_object(
    'id',p.id,'firstSeenAt',p.first_seen_at,'updatedAt',p.updated_at,'lastCheckedAt',p.last_checked_at,
    'classification',coalesce(o.result,c.result),
    'classificationSource',case when o.posting_id is not null then 'admin' when c.posting_id is not null then 'ai' else null end,
    'classificationStale',coalesce(coalesce(o.input_hash,c.input_hash) <> p.classification_hash,false),
    'changedAt',greatest(p.updated_at,c.created_at,o.updated_at)
  ) as document
from public.postings p left join public.classifications c on c.posting_id = p.id left join public.classification_overrides o on o.posting_id = p.id;
