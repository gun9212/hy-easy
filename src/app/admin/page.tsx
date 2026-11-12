import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminEditor } from "@/components/admin-editor";
import {
  AuditTable,
  ChangesTable,
  QueueTable,
  RunStatus,
  RunsTable,
  type Audit,
  type QueueItem,
  type Run,
  type Version,
} from "@/components/admin/admin-tables";
import { requireAdmin, HttpError } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data";
import { formatDate } from "@/lib/domain";

export const dynamic = "force-dynamic";
const ADMIN_LIST_LIMIT = 30;
const RECENT_LIMIT = 20;

export default async function Admin() {
  const { db, user } = await requireAdmin().catch((e: unknown) => {
    if (e instanceof HttpError) redirect(e.status === 403 ? "/postings" : "/login");
    throw e;
  });
  const [workspace, runs, queue, versions, audit] = await Promise.all([
    loadWorkspace(db, user.id),
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
  ]);
  for (const r of [runs, queue, versions, audit]) if (r.error) throw r.error;
  const postings = workspace.postings;
  // Unclassified, ambiguous or source-changed postings first; the full list can run to hundreds.
  const review = postings.filter(p => !p.classification || p.classification.needsReview || p.classificationStale);
  const runRows = (runs.data ?? []) as Run[];
  const queueRows = (queue.data ?? []) as QueueItem[];
  const lastRun = runRows[0];

  return (
    <div className="admin-page">
      <header className="login-header">
        <Link href="/postings" className="brand">
          <Image
            className="brand-symbol"
            src="/brand/hyu-symbol.svg"
            alt=""
            width={34}
            height={34}
            unoptimized
            priority
          />
          <span className="brand-name">HY-Easy</span>
        </Link>
        <Link className="back-link" href="/postings">
          공고 목록으로 돌아가기
        </Link>
      </header>
      <main className="admin-body">
        <h1>운영 관리</h1>
        <p className="admin-lead">수집이 멈추면 원문을 확인하고, 세션이 만료되면 운영자 세션을 갱신해 주세요.</p>

        <dl className="admin-stats">
          <div>
            <dt>공고</dt>
            <dd>{postings.length}건</dd>
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
            <dd>{review.length}건</dd>
          </div>
        </dl>

        <section className="admin-section">
          <h2>
            직군 검토 <span>{review.length}건</span>
          </h2>
          <p className="admin-note">
            분류가 없거나, AI가 확신하지 못했거나, 원문이 바뀐 공고입니다.
            {review.length > ADMIN_LIST_LIMIT && ` 앞의 ${ADMIN_LIST_LIMIT}건만 보여줍니다.`}
          </p>
          {review.length ? (
            <div className="admin-review-list">
              {review.slice(0, ADMIN_LIST_LIMIT).map(p => (
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
          <QueueTable queue={queueRows.slice(0, ADMIN_LIST_LIMIT)} postings={postings} />
        </section>

        <div className="admin-columns">
          <section className="admin-section">
            <h2>최근 원문 변경</h2>
            <ChangesTable versions={(versions.data ?? []) as Version[]} postings={postings} />
          </section>
          <section className="admin-section">
            <h2>관리자 수정 이력</h2>
            <AuditTable audit={(audit.data ?? []) as Audit[]} postings={postings} />
          </section>
        </div>
      </main>
    </div>
  );
}
