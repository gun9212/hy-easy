// Read-only tables for the admin page: collector runs, the classification queue, source changes and edits.
import { formatDate, type Posting } from "@/lib/domain";
import { RetryButton } from "./retry-button";

export type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  checked: number;
  changed: number;
  error_code: string | null;
};
export type QueueItem = { posting_id: string; attempts: number; last_error: string | null };
export type Version = { posting_id: string; captured_at: string };
/** What the tables need to name a posting. */
export type PostingName = Pick<Posting, "id" | "company" | "title">;
export type Audit = {
  posting_id: string;
  edited_at: string;
  editor_id?: string | null;
  result: { primaryRole?: unknown };
};

export const RUN_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "plain" }> = {
  running: { label: "실행 중", tone: "plain" },
  success: { label: "성공", tone: "ok" },
  partial: { label: "일부 성공", tone: "warn" },
  failed: { label: "실패", tone: "bad" },
  session_expired: { label: "세션 만료", tone: "bad" },
  skipped: { label: "건너뜀", tone: "plain" },
};

export function RunStatus({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? { label: status, tone: "plain" as const };
  return <span className={`status-chip ${s.tone}`}>{s.label}</span>;
}

function seconds(run: Run): string {
  if (!run.finished_at) return "";
  return `${Math.max(0, Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000))}초`;
}

function postingName(postings: PostingName[], id: string): { company: string; title: string } {
  const p = postings.find(posting => posting.id === id);
  return p ? { company: p.company, title: p.title } : { company: "삭제된 공고", title: "" };
}

function Empty({ text }: { text: string }) {
  return <p className="admin-empty">{text}</p>;
}

export function RunsTable({ runs }: { runs: Run[] }) {
  if (!runs.length) return <Empty text="아직 수집 실행 기록이 없습니다." />;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>시작</th>
            <th>상태</th>
            <th className="num">확인</th>
            <th className="num">변경</th>
            <th className="num">소요</th>
            <th>오류 코드</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.id}>
              <td>{formatDate(r.started_at, true)}</td>
              <td>
                <RunStatus status={r.status} />
              </td>
              <td className="num">{r.checked}</td>
              <td className="num">{r.changed}</td>
              <td className="num">{seconds(r)}</td>
              <td>{r.error_code ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The collector stops after this many failed tries; such rows wait until an admin retries them.
export const MAX_ATTEMPTS = 3;

export function QueueTable({ queue, postings }: { queue: QueueItem[]; postings: PostingName[] }) {
  if (!queue.length) return <Empty text="분류를 기다리는 공고가 없습니다." />;
  const stuck = queue.filter(q => q.attempts >= MAX_ATTEMPTS).length;
  return (
    <>
      {stuck > 0 && (
        <div className="admin-retry-bar">
          <p>
            {stuck}건이 {MAX_ATTEMPTS}번 실패해 자동 분류가 멈췄습니다.
          </p>
          <RetryButton label="멈춘 공고 모두 재시도" />
        </div>
      )}
      <QueueRows queue={queue} postings={postings} />
    </>
  );
}

function QueueRows({ queue, postings }: { queue: QueueItem[]; postings: PostingName[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>공고</th>
            <th className="num">시도</th>
            <th>마지막 오류</th>
            <th>
              <span className="visually-hidden">재시도</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {queue.map(q => {
            const p = postingName(postings, q.posting_id);
            return (
              <tr key={q.posting_id}>
                <td>
                  <b>{p.company}</b>
                  <small>{p.title}</small>
                </td>
                <td className="num">{q.attempts}회</td>
                <td>{q.last_error ?? "대기 중"}</td>
                <td>{q.attempts > 0 && <RetryButton postingId={q.posting_id} label="재시도" />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ChangesTable({ versions, postings }: { versions: Version[]; postings: PostingName[] }) {
  if (!versions.length) return <Empty text="최근 원문 변경이 없습니다." />;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>확인 시각</th>
            <th>공고</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v, i) => {
            const p = postingName(postings, v.posting_id);
            return (
              <tr key={`${v.posting_id}-${i}`}>
                <td>{formatDate(v.captured_at, true)}</td>
                <td>
                  <b>{p.company}</b>
                  <small>{p.title}</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AuditTable({ audit, postings }: { audit: Audit[]; postings: PostingName[] }) {
  if (!audit.length) return <Empty text="관리자가 수정한 분류가 없습니다." />;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>수정 시각</th>
            <th>공고</th>
            <th>바꾼 직군</th>
          </tr>
        </thead>
        <tbody>
          {audit.map((a, i) => {
            const p = postingName(postings, a.posting_id);
            return (
              <tr key={`${a.posting_id}-${i}`}>
                <td>{formatDate(a.edited_at, true)}</td>
                <td>
                  <b>{p.company}</b>
                  <small>{p.title}</small>
                </td>
                <td>
                  <span className="role-tag">{String(a.result.primaryRole ?? "")}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
