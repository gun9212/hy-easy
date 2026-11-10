"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, Check, Clock3, Info } from "lucide-react";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  deadlineLabel,
  formatDate,
  isBlocking,
  simulate,
  type Application,
  type ApplicationStatus,
  type Posting,
} from "@/lib/domain";

type RecordFn = (postingId: string, status: ApplicationStatus, confirmed: boolean) => Promise<void>;
type Props = { postings: Posting[]; applications: Application[]; record: RecordFn; now: Date };

const companyOf = (postings: Posting[], id: string | undefined) => postings.find(p => p.id === id);

function PanelHeading({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="panel-heading">
      <span className="step-number">{step}</span>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

function StatusPanel({ postings, applications, record }: Omit<Props, "now">) {
  const active = applications.find(a => isBlocking(a.status));
  const [postingId, setPostingId] = useState(active?.postingId ?? "");
  const [status, setStatus] = useState<ApplicationStatus>(active?.status ?? "in_progress");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await record(postingId, status, confirmed);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "기록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="planner-panel">
      <PanelHeading step="01" title="나의 지원 상태" text="HY-WEP에서 확인한 상태를 직접 기록하세요." />
      {active ? (
        <div className="current-application">
          <span className="eyebrow">현재 지원</span>
          <h3>{companyOf(postings, active.postingId)?.company ?? "등록된 공고"}</h3>
          <span className="role-tag">{STATUS_LABELS[active.status]}</span>
          <small>기록 시각 {formatDate(active.updatedAt, true)}</small>
        </div>
      ) : (
        <div className="no-application">
          <Check size={20} />
          <span>기록된 진행 중 지원이 없어요.</span>
        </div>
      )}
      <form onSubmit={submit}>
        <label className="form-field">
          지원한 공고
          <select
            required
            value={postingId}
            onChange={e => {
              setPostingId(e.target.value);
              setStatus(applications.find(a => a.postingId === e.target.value)?.status ?? "in_progress");
              setConfirmed(false);
            }}
          >
            <option value="">공고를 선택하세요</option>
            {postings.map(p => (
              <option key={p.id} value={p.id}>
                {p.company} · {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          확인한 지원 상태
          <select
            value={status}
            onChange={e => {
              setStatus(e.target.value as ApplicationStatus);
              setConfirmed(false);
            }}
          >
            {APPLICATION_STATUSES.map(s => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {status === "rejected" && (
          <label className="confirmation-check">
            <input required type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            HY-WEP에서 탈락 처리가 완료된 것을 확인했습니다.
          </label>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button className="primary-button full-width" disabled={busy || !postingId}>
          {busy ? "기록 중…" : "지원 상태 기록"}
          <Check size={15} />
        </button>
      </form>
    </section>
  );
}

function ScenarioPanel({ postings, applications, now }: Omit<Props, "record">) {
  const active = applications.find(a => isBlocking(a.status));
  const [candidateId, setCandidateId] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const candidate = companyOf(postings, candidateId);
  const result = candidate && releaseAt ? simulate(candidate, `${releaseAt}:00+09:00`, now) : null;
  return (
    <section className="planner-panel">
      <PanelHeading step="02" title="다음 지원 시나리오" text="탈락 처리 완료 시각을 가정해 마감과 비교해요." />
      <div className="scenario-flow">
        <span>현재 기업 지원</span>
        <ArrowRight size={15} />
        <span>HY-WEP 탈락 처리 완료</span>
        <ArrowRight size={15} />
        <span>다음 기업</span>
      </div>
      <label className="form-field">
        다음에 지원하고 싶은 공고
        <select value={candidateId} onChange={e => setCandidateId(e.target.value)}>
          <option value="">후보 공고를 선택하세요</option>
          {postings
            .filter(p => p.id !== active?.postingId)
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.company} · {p.title}
              </option>
            ))}
        </select>
      </label>
      <label className="form-field">
        예상 탈락 처리 완료 시각 · 한국 시간
        <input type="datetime-local" value={releaseAt} onChange={e => setReleaseAt(e.target.value)} />
      </label>
      {candidate && (
        <p className="scenario-deadline">
          <Clock3 size={14} />
          후보 기업 마감 <b>{deadlineLabel(candidate)}</b>
        </p>
      )}
      {result ? (
        <div className={`decision decision-${result.status}`} role="status">
          <CalendarClock size={20} />
          <div>
            <b>{result.label}</b>
            <p>{result.reason}</p>
          </div>
        </div>
      ) : (
        <div className="scenario-placeholder">
          <CalendarClock size={27} />
          <p>
            후보 공고와 가정 시각을 입력하면
            <br />
            마감 전 지원 가능성을 확인할 수 있어요.
          </p>
        </div>
      )}
      <p className="muted small">
        예상 시각은 실제 처리 완료를 보장하지 않습니다. 이 계산으로 지원 상태가 변경되지는 않습니다.
      </p>
    </section>
  );
}

function History({ postings, applications }: Pick<Props, "postings" | "applications">) {
  return (
    <section className="application-history">
      <h2>
        지원 기록 <span>{applications.length}</span>
      </h2>
      {applications.length ? (
        <div className="history-list">
          {applications.map(a => {
            const p = companyOf(postings, a.postingId);
            return (
              <div key={a.id}>
                <span className="company-logo logo-1">{p?.company.slice(0, 1) ?? "H"}</span>
                <div>
                  <b>{p?.company ?? "등록된 공고"}</b>
                  <small>{p?.title}</small>
                </div>
                <span className="role-tag">{STATUS_LABELS[a.status]}</span>
                <time>{formatDate(a.updatedAt, true)}</time>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">첫 지원을 기록하면 이곳에 모아볼 수 있어요.</p>
      )}
    </section>
  );
}

export function Planner({ postings, applications, record, now }: Props) {
  return (
    <div className="planner">
      <div className="planner-rule">
        <Info size={20} />
        <div>
          <b>한 번에 한 기업, 탈락 처리 완료가 다음 지원의 시작이에요.</b>
          <p>
            탈락 통보를 받았거나 발표일이 지나도 자동으로 지원 제한이 풀리지 않습니다. HY-WEP의 실제 처리 상태를 확인해
            주세요.
          </p>
        </div>
      </div>
      <div className="planner-grid">
        <StatusPanel postings={postings} applications={applications} record={record} />
        <ScenarioPanel postings={postings} applications={applications} now={now} />
      </div>
      <History postings={postings} applications={applications} />
    </div>
  );
}
