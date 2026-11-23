import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminEditor } from "@/components/admin-editor";
import { AdminAlerts } from "@/components/admin/admin-alerts";
import { FeedbackList, type FeedbackItem } from "@/components/admin/feedback-list";
import {
  AuditTable,
  ChangesTable,
  QueueTable,
  RunStatus,
  RunsTable,
  type Audit,
  type PostingName,
  type QueueItem,
  type Run,
  type Version,
} from "@/components/admin/admin-tables";
import { requireAdmin, HttpError } from "@/lib/auth";
import { formatDate, type Posting } from "@/lib/domain";

export const dynamic = "force-dynamic";
const ADMIN_LIST_LIMIT = 30;
const RECENT_LIMIT = 20;
const FEEDBACK_LIMIT = 50;

export default async function Admin() {
  const { db } = await requireAdmin().catch((e: unknown) => {
    if (e instanceof HttpError) redirect(e.status === 403 ? "/postings" : "/login");
    throw e;
  });
  // Reads only what the page shows: the postings that need review and a count, not the whole posting list.
  const [review, total, runs, queue, versions, audit, feedback, unreadFeedback] = await Promise.all([
    db
      .from("posting_view")
      .select("document")
      // Unclassified, ambiguous or source-changed postings.
      .or(
        "document->>classification.is.null,document->classification->>needsReview.eq.true,document->>classificationStale.eq.true",
      )
      .order("first_seen_at", { ascending: false }),
    db.from("postings").select("id", { count: "exact", head: true }),
    db.from("collector_runs").select("*").order("started_at", { ascending: false }).limit(RECENT_LIMIT),
    db.from("classification_queue").select("posting_id,attempts,last_error"),
    db
      .from("posting_versions")
      .select("posting_id,captured_at")
      .order("captured_at", { ascending: false })
      .limit(RECENT_LIMIT),
    db
      .from("classification_audit")
      .select("posting_id,edited_at,editor_id,result")
      .order("edited_at", { ascending: false })
      .limit(RECENT_LIMIT),
    db
      .from("feedback")
      .select("id,message,page,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_LIMIT),
    db.from("feedback").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  for (const r of [review, total, runs, queue, versions, audit, feedback, unreadFeedback]) if (r.error) throw r.error;
  const feedbackRows = (feedback.data ?? []) as FeedbackItem[];
  const unreadCount = unreadFeedback.count ?? 0;
  const reviewPostings = (review.data ?? []).map(row => row.document as Posting);
  const runRows = (runs.data ?? []) as Run[];
  const queueRows = (queue.data ?? []) as QueueItem[];
  const versionRows = (versions.data ?? []) as Version[];
  const auditRows = (audit.data ?? []) as Audit[];
  const lastRun = runRows[0];
  const names = await postingNames(db, [
    ...queueRows.slice(0, ADMIN_LIST_LIMIT).map(q => q.posting_id),
    ...versionRows.map(v => v.posting_id),
    ...auditRows.map(a => a.posting_id),
  ]);

  return (
    <div className="admin-page">
      <header className="login-header">
        <Link href="/postings" className="brand">
          <span className="brand-name">HY-Easy</span>
        </Link>
        <Link className="back-link" href="/postings">
          공고 목록으로 돌아가기
        </Link>
      </header>
      <main className="admin-body">
        <h1>운영 관리</h1>
        <p className="admin-lead">수집이 멈추면 원문을 확인하고, 세션이 만료되면 운영자 세션을 갱신해 주세요.</p>
        <AdminAlerts runs={runRows} queue={queueRows} />

        <dl className="admin-stats">
          <div>
            <dt>공고</dt>
            <dd>{total.count ?? 0}건</dd>
          </div>
          <div>
            <dt>최근 수집</dt>
            <dd>
              {lastRun ? (
                <>
                  {formatDate(lastRun.started_at, true)} <RunStatus status={lastRun.status} />
                </>
              ) : (
                "기록 없음"
              )}
            </dd>
          </div>
          <div>
            <dt>분류 대기</dt>
            <dd>{queueRows.length}건</dd>
          </div>
          <div>
            <dt>직군 검토 필요</dt>
            <dd>{reviewPostings.length}건</dd>
          </div>
          <div>
            <dt>새 피드백</dt>
            <dd>{unreadCount}건</dd>
          </div>
        </dl>

        <section className="admin-section">
          <h2>
            피드백 <span>새 피드백 {unreadCount}건</span>
          </h2>
          <p className="admin-note">
            학생이 앱에서 보낸 익명 피드백입니다. 보낸 사람은 저장하지 않습니다.
            {feedbackRows.length === FEEDBACK_LIMIT && ` 최근 ${FEEDBACK_LIMIT}건만 보여줍니다.`}
          </p>
          <FeedbackList items={feedbackRows} unread={unreadCount} />
        </section>

        <section className="admin-section">
          <h2>
            직군 검토 <span>{reviewPostings.length}건</span>
          </h2>
          <p className="admin-note">
            분류가 없거나, AI가 확신하지 못했거나, 원문이 바뀐 공고입니다.
            {reviewPostings.length > ADMIN_LIST_LIMIT && ` 앞의 ${ADMIN_LIST_LIMIT}건만 보여줍니다.`}
          </p>
          {reviewPostings.length ? (
            <div className="admin-review-list">
              {reviewPostings.slice(0, ADMIN_LIST_LIMIT).map(p => (
                <AdminEditor key={p.id} posting={p} />
              ))}
            </div>
          ) : (
            <p className="admin-empty">검토할 공고가 없습니다.</p>
          )}
        </section>

        <section className="admin-section">
          <h2>최근 수집 실행</h2>
          <RunsTable runs={runRows} />
        </section>

        <section className="admin-section">
          <h2>
            분류 대기 <span>{queueRows.length}건</span>
          </h2>
          <QueueTable queue={queueRows.slice(0, ADMIN_LIST_LIMIT)} postings={names} />
        </section>

        <div className="admin-columns">
          <section className="admin-section">
            <h2>최근 원문 변경</h2>
            <ChangesTable versions={versionRows} postings={names} />
          </section>
          <section className="admin-section">
            <h2>관리자 수정 이력</h2>
            <AuditTable audit={auditRows} postings={names} />
          </section>
        </div>
      </main>
    </div>
  );
}

/** Company and title of the postings the tables name, read in one query. */
async function postingNames(db: SupabaseClient, ids: string[]): Promise<PostingName[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const { data, error } = await db
    .from("postings")
    .select("id,company:document->>company,title:document->>title")
    .in("id", unique);
  if (error) throw error;
  return (data ?? []) as PostingName[];
}
