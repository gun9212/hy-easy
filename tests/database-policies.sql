begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
insert into auth.users values
 ('00000000-0000-4000-8000-000000000001','a@hanyang.ac.kr',now()),
 ('00000000-0000-4000-8000-000000000002','b@hanyang.ac.kr',now()),
 ('00000000-0000-4000-8000-000000000003','c@gmail.com',now()),
 ('00000000-0000-4000-8000-000000000004','d@hanyang.ac.kr',null);
insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',email_confirmed_at is not null) from auth.users;

set local role service_role;
select pg_temp.assert(public.sync_posting('{"sourceId":"one","company":"Company","title":"Role A","tasks":"SQL","recruitment":"open"}', 'hash1','class1'),'first import changes data');
select pg_temp.assert(not public.sync_posting('{"sourceId":"one","company":"Company","title":"Role A","tasks":"SQL","recruitment":"open"}', 'hash1','class1'),'repeat import is idempotent');
select public.sync_posting('{"sourceId":"two","company":"Company","title":"Role B","tasks":"Java","recruitment":"open"}','hash2','class2');
select pg_temp.assert((select count(*)=1 from public.companies),'two departments share one company');
select pg_temp.assert((select count(*)=2 from public.posting_versions),'idempotent import creates no extra version');
select pg_temp.assert(public.acquire_collector_lock('00000000-0000-4000-8000-000000000001'),'first lock succeeds');
select pg_temp.assert(not public.acquire_collector_lock('00000000-0000-4000-8000-000000000002'),'overlap is skipped');
select public.release_collector_lock('00000000-0000-4000-8000-000000000002');
select pg_temp.assert((select count(*)=1 from public.collector_locks),'another worker cannot release lock');
select public.release_collector_lock('00000000-0000-4000-8000-000000000001');
select pg_temp.assert(public.touch_postings('[{"source_id":"one","applicants":5},{"source_id":"missing","applicants":1}]')=1,'touch updates only listed known postings');
select pg_temp.assert((select (document->>'applicants')::int=5 from public.postings where source_id='one'),'touch stores live applicant count');
select pg_temp.assert((select count(*)=2 from public.posting_versions),'applicant churn creates no version');
select public.mark_detail_checked('one','listhash1');
select pg_temp.assert((select list_hash='listhash1' and detail_checked_at is not null from public.postings where source_id='one'),'detail check recorded');
reset role;

set local role anon;
do $$ begin begin perform * from public.postings; raise exception 'anonymous read unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
reset role;
set local role authenticated;
select set_config('test.uid','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert(not public.is_school_user(),'non-school rejected');
select pg_temp.assert((select count(*)=0 from public.posting_view),'non-school cannot read view');
select set_config('test.uid','00000000-0000-4000-8000-000000000004',true);
select pg_temp.assert((select count(*)=0 from public.postings),'unverified school rejected');
select set_config('test.uid','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(public.is_school_user(),'verified school accepted');
select pg_temp.assert((select count(*)=2 from public.posting_view),'school reads source data');
insert into public.favorites select auth.uid(),id,now() from public.postings where source_id='one';
select public.record_application((select id from public.postings where source_id='one'),'in_progress');
select public.record_application((select id from public.postings where source_id='one'),'rejection_pending');
do $$ begin begin perform public.record_application((select id from public.postings where source_id='two'),'in_progress'); raise exception 'second active application unexpectedly succeeded'; exception when unique_violation then null; end; end $$;
select public.record_application((select id from public.postings where source_id='one'),'rejected');
select public.record_application((select id from public.postings where source_id='two'),'in_progress');
select pg_temp.assert((select count(*)=4 from public.application_events),'state changes retain an audit trail');
do $$ begin begin insert into public.admins values(auth.uid()); raise exception 'admin escalation unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin update public.postings set content_hash='tampered'; raise exception 'source write unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
select set_config('test.uid','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert((select count(*)=0 from public.applications),'other user application isolation');
select pg_temp.assert((select count(*)=0 from public.application_events),'other user event isolation');
select pg_temp.assert((select count(*)=0 from public.favorites),'other user favorites isolation');
do $$ begin begin perform public.acquire_collector_lock('00000000-0000-4000-8000-000000000002'); raise exception 'school worker access unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform public.touch_postings('[]'); raise exception 'school touch access unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
reset role;

insert into public.admins values('00000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('test.uid','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(public.is_admin(),'explicit admin role works');
select public.override_classification((select id from public.postings where source_id='one'),'{"primaryRole":"開発","summary":"manual"}');
reset role;
set local role service_role;
select public.sync_posting('{"sourceId":"one","company":"Company","title":"Role A","tasks":"Python","recruitment":"open"}','hash3','class3');
reset role;
set local role authenticated;
select pg_temp.assert((select document->>'classificationSource'='admin' from public.posting_view where document->>'sourceId'='one'),'manual correction preserved');
select pg_temp.assert((select (document->>'classificationStale')::boolean from public.posting_view where document->>'sourceId'='one'),'changed source flags manual correction for review');
select pg_temp.assert((select count(*)=1 from public.classification_audit),'admin changes audited');
reset role;

set local role service_role;
update public.classification_queue set attempts=3,last_error='CLASSIFICATION_REQUIRES_REVIEW';
reset role;
set local role authenticated;
select set_config('test.uid','00000000-0000-4000-8000-000000000002',true);
do $$ begin begin perform public.retry_classification(); raise exception 'non-admin retry unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
select set_config('test.uid','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(public.retry_classification((select id from public.postings where source_id='one'))=1,'admin retries one posting');
select pg_temp.assert((select attempts=0 and last_error is null from public.classification_queue q join public.postings p on p.id=q.posting_id where p.source_id='one'),'retried posting is runnable again');
select pg_temp.assert((select attempts=3 from public.classification_queue q join public.postings p on p.id=q.posting_id where p.source_id='two'),'single retry leaves other postings');
select pg_temp.assert(public.retry_classification()=1,'admin retries every exhausted posting');
select pg_temp.assert((select count(*)=0 from public.classification_queue where attempts>0),'no exhausted postings remain');
reset role;

-- Feedback: school users add anonymous rows, only admins read them and mark them read.
set local role authenticated;
select set_config('test.uid','00000000-0000-4000-8000-000000000002',true);
insert into public.feedback(message,page) values('필터가 헷갈려요','/postings');
select pg_temp.assert((select count(*)=0 from public.feedback),'non-admin cannot read feedback, even their own');
do $$ begin begin insert into public.feedback(message) values('   '); raise exception 'blank feedback unexpectedly accepted'; exception when check_violation then null; end; end $$;
-- RLS hides every row from a non-admin, so this update touches nothing (checked below as admin: still unread).
update public.feedback set read_at=now();
select set_config('test.uid','00000000-0000-4000-8000-000000000003',true);
do $$ begin begin insert into public.feedback(message) values('spam'); raise exception 'non-school feedback unexpectedly accepted'; exception when insufficient_privilege then null; end; end $$;
reset role;
set local role anon;
do $$ begin begin insert into public.feedback(message) values('anon'); raise exception 'anonymous feedback unexpectedly accepted'; exception when insufficient_privilege then null; end; end $$;
reset role;
set local role authenticated;
select set_config('test.uid','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert((select count(*)=1 and bool_and(read_at is null) from public.feedback),'admin reads new feedback');
update public.feedback set read_at=now();
select pg_temp.assert((select bool_and(read_at is not null) from public.feedback),'admin marks feedback read');
reset role;

-- User counts: admin only, verified school accounts only (a@, b@; not the gmail or the unconfirmed one).
update auth.users set last_sign_in_at=now() where email='a@hanyang.ac.kr';
update auth.users set last_sign_in_at=now()-interval '30 days', created_at=now()-interval '30 days' where email='b@hanyang.ac.kr';
set local role authenticated;
select set_config('test.uid','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(public.admin_user_stats()='{"total":2,"active7d":1,"new7d":1}'::jsonb,'admin sees school user counts');
select set_config('test.uid','00000000-0000-4000-8000-000000000002',true);
do $$ begin begin perform public.admin_user_stats(); raise exception 'non-admin user stats unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
reset role;
set local role anon;
do $$ begin begin perform public.admin_user_stats(); raise exception 'anonymous user stats unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
reset role;

-- Daily usage: a visit is one row per student per day; only admins read the counts.
set local role authenticated;
select set_config('test.uid','00000000-0000-4000-8000-000000000001',true);
select public.touch_activity();
select public.touch_activity();
select set_config('test.uid','00000000-0000-4000-8000-000000000002',true);
select public.touch_activity();
do $$ begin begin perform * from public.activity_days; raise exception 'student read of activity unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform public.admin_usage_daily(7); raise exception 'non-admin usage unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
select set_config('test.uid','00000000-0000-4000-8000-000000000003',true);
select public.touch_activity();
select set_config('test.uid','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert((select count(*)=7 from public.admin_usage_daily(7)),'one row per day');
select pg_temp.assert((select active=2 and signups=1 from public.admin_usage_daily(7) order by day desc limit 1),'today: two school visitors (repeat visit and non-school ignored), one school sign-up');
reset role;
set local role anon;
do $$ begin begin perform public.touch_activity(); raise exception 'anonymous touch unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
select 'Database security and collection assertions passed' as result;
