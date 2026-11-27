"use client";

import { useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DateTimeInput, type ISODateTimeString } from "@astryxdesign/core/DateTimeInput";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/Stack";
import { PostingPicker } from "./posting-picker";
import { ArrowRight, CalendarClock, Check, Clock3, Info, Trash2 } from "lucide-react";
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
type RemoveFn = (postingId: string) => Promise<void>;
type Props = {
  postings: Posting[];
  applications: Application[];
  record: RecordFn;
  remove: RemoveFn;
  now: Date;
  initialPostingId?: string | null;
};

const companyOf = (postings: Posting[], id: string | undefined) => postings.find(p => p.id === id);

function PanelHeading({ title, text }: { title: string; text: string }) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function StatusPanel({
  postings,
  applications,
  record,
  initialPostingId,
}: Pick<Props, "postings" | "applications" | "record"> & { initialPostingId: string | null }) {
  const active = applications.find(a => isBlocking(a.status));
  const initialId = active?.postingId ?? initialPostingId ?? "";
  const [postingId, setPostingId] = useState(initialId);
  const [status, setStatus] = useState<ApplicationStatus>(
    active?.status ?? applications.find(a => a.postingId === initialId)?.status ?? "in_progress",
  );
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
      <PanelHeading title="나의 지원 상태" text="HY-WEP에서 확인한 상태를 직접 기록하세요." />
      {active ? (
        <dl className="current-application">
          <dt>현재 지원</dt>
          <dd className="current-company">{companyOf(postings, active.postingId)?.company ?? "등록된 공고"}</dd>
          <dd>
            <span className="role-tag">{STATUS_LABELS[active.status]}</span>
            <small>기록 시각 {formatDate(active.updatedAt, true)}</small>
          </dd>
        </dl>
      ) : (
        <div className="no-application">
          <Check size={20} />
          <span>기록된 진행 중 지원이 없어요.</span>
        </div>
      )}
      <form onSubmit={submit}>
        <PostingPicker
          label="지원한 공고"
          placeholder="공고를 선택하세요"
          required
          postings={postings}
          value={postingId}
          onChange={id => {
            setPostingId(id);
            setStatus(applications.find(a => a.postingId === id)?.status ?? "in_progress");
            setConfirmed(false);
          }}
        />
        <Selector
          label="확인한 지원 상태"
          options={APPLICATION_STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))}
          value={status}
          onChange={value => {
            setStatus(value as ApplicationStatus);
            setConfirmed(false);
          }}
          width="100%"
        />
        {status === "rejected" && (
          <CheckboxInput
            label="HY-WEP에서 탈락 처리가 완료된 것을 확인했습니다."
            value={confirmed}
            onChange={setConfirmed}
            isRequired
          />
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <Button
          type="submit"
          variant="primary"
          label={busy ? "기록 중…" : "지원 상태 기록"}
          icon={<Check size={15} />}
          isLoading={busy}
          isDisabled={!postingId || (status === "rejected" && !confirmed)}
          width="100%"
        />
      </form>
    </section>
  );
}

function ScenarioPanel({
  postings,
  applications,
  now,
  initialPostingId,
}: Pick<Props, "postings" | "applications" | "now"> & { initialPostingId: string | null }) {
  const active = applications.find(a => isBlocking(a.status));
  const defaultCandidateId = initialPostingId && initialPostingId !== active?.postingId ? initialPostingId : "";
  const [candidateId, setCandidateId] = useState(defaultCandidateId);
  // Korean time as YYYY-MM-DDTHH:MM (the input may add :SS); the offset is added below.
  const [releaseAt, setReleaseAt] = useState<ISODateTimeString | undefined>();
  const candidates = useMemo(() => postings.filter(p => p.id !== active?.postingId), [postings, active?.postingId]);
  const candidate = companyOf(postings, candidateId);
  const releaseIso = releaseAt?.length === 16 ? `${releaseAt}:00+09:00` : `${releaseAt}+09:00`;
  const result = candidate && releaseAt ? simulate(candidate, releaseIso, now) : null;
  return (
    <section className="planner-panel">
      <PanelHeading title="다음 지원 시나리오" text="탈락 처리 완료 시각을 가정해 마감과 비교해요." />
      <div className="scenario-flow">
        <span>현재 기업 지원</span>
        <ArrowRight size={15} />
        <span>HY-WEP 탈락 처리 완료</span>
        <ArrowRight size={15} />
        <span>다음 기업</span>
      </div>
      <VStack gap={4}>
        <PostingPicker
          label="다음에 지원하고 싶은 공고"
          placeholder="후보 공고를 선택하세요"
          postings={candidates}
          value={candidateId}
          onChange={setCandidateId}
        />
        <DateTimeInput
          label="예상 탈락 처리 완료 시각 · 한국 시간"
          value={releaseAt}
          onChange={setReleaseAt}
          hasClear
          width="100%"
        />
      </VStack>
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

function History({ postings, applications, remove }: Pick<Props, "postings" | "applications" | "remove">) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function confirmDelete(postingId: string) {
    setError("");
    setBusyId(postingId);
    try {
      await remove(postingId);
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="application-history">
      <h2>
        지원 기록 <span>{applications.length}</span>
      </h2>
      {error && (
        <div className="form-error history-error" role="alert">
          {error}
        </div>
      )}
      {applications.length ? (
        <div className="history-list">
          {applications.map(a => {
            const p = companyOf(postings, a.postingId);
            const name = p?.company ?? "등록된 공고";
            const confirming = confirmId === a.postingId;
            const busy = busyId === a.postingId;
            return (
              <div key={a.id}>
                <div>
                  <b>{name}</b>
                  <small>{p?.title}</small>
                </div>
                <span className="role-tag">{STATUS_LABELS[a.status]}</span>
                <time>{formatDate(a.updatedAt, true)}</time>
                <div className="history-actions">
                  {confirming ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        label={busy ? "삭제 중…" : "삭제 확인"}
                        isLoading={busy}
                        isDisabled={busyId !== null && !busy}
                        onClick={() => confirmDelete(a.postingId)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        label="취소"
                        isDisabled={busyId !== null}
                        onClick={() => {
                          setConfirmId(null);
                          setError("");
                        }}
                      />
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      label="삭제"
                      icon={<Trash2 size={14} />}
                      aria-label={`${name} 지원 기록 삭제`}
                      isDisabled={busyId !== null}
                      onClick={() => {
                        setError("");
                        setConfirmId(a.postingId);
                      }}
                    />
                  )}
                </div>
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

export function Planner({ postings, applications, record, remove, now, initialPostingId }: Props) {
  // Saved applications can arrive after the first render (demo storage, live data). Keying the form on the active
  // application or requested posting resets its fields whenever it loads or changes. The two panels are siblings, so
  // each key carries its panel's name: without an active application both were "none:", and React then kept the old
  // panel next to the new one after the first record.
  const active = applications.find(a => isBlocking(a.status));
  const validInitialId = initialPostingId && postings.some(p => p.id === initialPostingId) ? initialPostingId : null;
  const statusKey = `status:${active ? `${active.postingId}:${active.status}` : `none:${validInitialId ?? ""}`}`;
  const scenarioKey = `scenario:${active?.postingId ?? "none"}:${validInitialId ?? ""}`;
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
        <StatusPanel
          key={statusKey}
          postings={postings}
          applications={applications}
          record={record}
          initialPostingId={validInitialId}
        />
        <ScenarioPanel
          key={scenarioKey}
          postings={postings}
          applications={applications}
          now={now}
          initialPostingId={validInitialId}
        />
      </div>
      <History postings={postings} applications={applications} remove={remove} />
    </div>
  );
}
