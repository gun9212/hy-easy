import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin, HttpError } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data";
import { formatDate } from "@/lib/domain";
import { AdminEditor } from "@/components/admin-editor";
export const dynamic = "force-dynamic";
const ADMIN_LIST_LIMIT = 30;
export default async function Admin() {
  const { db, user } = await requireAdmin().catch((e: unknown) => {
    if (e instanceof HttpError) redirect(e.status === 403 ? "/postings" : "/login");
    throw e;
  });
  const [workspace, runs, queue, versions, audit] = await Promise.all([
    loadWorkspace(db, user.id),
    db.from("collector_runs").select("*").order("started_at", { ascending: false }).limit(20),
    db.from("classification_queue").select("posting_id,attempts,last_error"),
    db
      .from("posting_versions")
      .select("posting_id,captured_at,content_hash")
      .order("captured_at", { ascending: false })
      .limit(20),
    db
      .from("classification_audit")
      .select("posting_id,edited_at,editor_id,result")
      .order("edited_at", { ascending: false })
      .limit(20),
  ]);
  for (const r of [runs, queue, versions, audit]) if (r.error) throw r.error;
  // Unclassified, ambiguous or source-changed postings first; the full list can run to hundreds.
  const review = workspace.postings.filter(
    p => !p.classification || p.classification.needsReview || p.classificationStale,
  );
  return (
    <main className="admin-page">
      <Link className="back-link" href="/postings">
        공고 목록으로 돌아가기
      </Link>
      <h1>수집 · 분류 관리</h1>
      <p className="muted">수집 실패 시 원문을 확인하고, 세션 만료 시 운영자 세션을 갱신해 주세요.</p>
      <section>
        <h2>최근 수집 실행</h2>
        {runs.data?.length ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>시작</th>
                <th>상태</th>
                <th>확인 / 변경</th>
                <th>오류 코드</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map(r => (
                <tr key={r.id}>
                  <td>{formatDate(r.started_at, true)}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.checked} / {r.changed}
                  </td>
                  <td>{r.error_code || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">아직 수집 실행 기록이 없습니다.</p>
        )}
      </section>
      <section>
        <h2>분류 대기 · 실패 {queue.data?.length ?? 0}건</h2>
        {queue.data?.slice(0, ADMIN_LIST_LIMIT).map(q => (
          <p className="muted small" key={q.posting_id}>
            {workspace.postings.find(p => p.id === q.posting_id)?.company} · 시도 {q.attempts}회 ·{" "}
            {q.last_error ?? "대기"}
          </p>
        ))}
      </section>
      <section>
        <h2>
          직군 검토 · 수정{" "}
          <small className="muted">
            검토 필요 {review.length}건 중 {Math.min(review.length, ADMIN_LIST_LIMIT)}건 표시
          </small>
        </h2>
        {review.slice(0, ADMIN_LIST_LIMIT).map(p => (
          <AdminEditor key={p.id} posting={p} />
        ))}
      </section>
      <section>
        <h2>최근 원문 변경</h2>
        {versions.data?.map((v, i) => (
          <p className="small muted" key={i}>
            {formatDate(v.captured_at, true)} · {workspace.postings.find(p => p.id === v.posting_id)?.company} ·{" "}
            {v.content_hash.slice(0, 12)}
          </p>
        ))}
      </section>
      <section>
        <h2>관리자 수정 이력</h2>
        {audit.data?.map((a, i) => (
          <p className="small muted" key={i}>
            {formatDate(a.edited_at, true)} · {workspace.postings.find(p => p.id === a.posting_id)?.company} ·{" "}
            {String(a.result.primaryRole)}
          </p>
        ))}
      </section>
    </main>
  );
}
