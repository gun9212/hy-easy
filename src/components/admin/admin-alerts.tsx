// Warning banner at the top of the admin page: what an alert email is about, readable at a glance.
import type { QueueItem, Run } from "./admin-tables";

const FAILED_STREAK = 3;
const MAX_ATTEMPTS = 3;
const FAILED = new Set(["failed", "session_expired"]);
const IGNORED = new Set(["running", "skipped"]);

const CAUSES: Record<string, string> = {
  LOGIN_FAILED: "포털 로그인 실패: 비밀번호가 바뀌었는지 확인하고 Secret Manager 값을 갱신하세요.",
  LOGIN_BLOCKED:
    "포털 로그인이 3회 연속 실패해 자동 로그인을 멈췄습니다. 비밀번호를 확인하고 Secret Manager 값을 갱신하면 다시 시도합니다. 비밀번호가 맞다면 collector_state의 hywep_login 값을 비우세요.",
  SESSION_EXPIRED: "포털 세션 만료: 자동 로그인이 실패했습니다. 비밀번호와 Secret Manager 값을 확인하세요.",
  COLLECTION_FAILED:
    "수집 오류: HY-WEP 화면 구조가 바뀌었을 수 있습니다. Cloud Run 작업 로그의 collection_failed 오류 코드(errorCode·reason)를 확인하세요.",
  DETAIL_READ_FAILED:
    "공고 상세 조회 실패: HY-WEP 상세 화면 구조가 바뀌었거나 일시 오류일 수 있습니다. Cloud Run 작업 로그의 detail_read_failed 오류 코드(errorCode·reason)를 확인하세요.",
};

/** Number of finished runs at the head of the list that failed, and the newest error code. */
export function failedStreak(runs: Run[]): { count: number; errorCode: string | null } {
  const finished = runs.filter(r => !IGNORED.has(r.status));
  let count = 0;
  while (count < finished.length && FAILED.has(finished[count].status)) count += 1;
  return { count, errorCode: finished[0]?.error_code ?? null };
}

/** Consecutive partial runs caused by DETAIL_READ_FAILED (excludes normal CHECKPOINT_SAVED time slices). */
export function detailFailureStreak(runs: Run[]): number {
  const finished = runs.filter(r => !IGNORED.has(r.status));
  let count = 0;
  while (
    count < finished.length &&
    finished[count].status === "partial" &&
    finished[count].error_code === "DETAIL_READ_FAILED"
  ) {
    count += 1;
  }
  return count;
}

export function AdminAlerts({ runs, queue }: { runs: Run[]; queue: QueueItem[] }) {
  const streak = failedStreak(runs);
  const detailStreak = detailFailureStreak(runs);
  const stuck = queue.filter(q => q.attempts >= MAX_ATTEMPTS).length;
  const alerts: string[] = [];
  if (streak.count >= FAILED_STREAK) {
    const cause = (streak.errorCode && CAUSES[streak.errorCode]) || `오류 코드 ${streak.errorCode ?? "없음"}`;
    alerts.push(`최근 ${streak.count}회 연속 수집 실패. ${cause}`);
  }
  if (detailStreak >= FAILED_STREAK) {
    alerts.push(`최근 ${detailStreak}회 연속 상세 조회 실패. ${CAUSES.DETAIL_READ_FAILED}`);
  }
  if (stuck) alerts.push(`AI 분류를 3번 실패한 공고 ${stuck}건. 아래 "직군 검토"에서 직접 확정할 수 있어요.`);
  if (!alerts.length) return null;
  return (
    <div className="admin-alerts" role="alert">
      {alerts.map(text => (
        <p key={text}>{text}</p>
      ))}
    </div>
  );
}
