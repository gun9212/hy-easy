"use client";

import { Bookmark, Clock3, ExternalLink, Sparkles, X } from "lucide-react";
import {
  deadlineLabel,
  eligibility,
  formatDate,
  majorFit,
  MAJOR_FIT_LABELS,
  stipendLabel,
  type Application,
  type Posting,
} from "@/lib/domain";
import type { Major } from "@/lib/majors";
import { Modal } from "./modal";

type Props = {
  posting: Posting;
  major: Major | null;
  applications: Application[];
  now: Date;
  saved: boolean;
  onFavorite: () => void;
  close: () => void;
  onPlan: () => void;
};

function Facts({ posting: p }: { posting: Posting }) {
  const facts: [string, string][] = [
    ["지원금", stipendLabel(p)],
    ["마감시간 · 한국 시간", deadlineLabel(p)],
    ["실습 기간", p.period || "미기재"],
    ["근무 지역", p.location || "미기재"],
    ["모집 인원", p.headcount !== null ? `${p.headcount}명` : "미기재"],
    ["지원 인원", p.applicants !== null ? `${p.applicants}명` : "미기재"],
    ["모집 학기", p.term || "미기재"],
    ["유형", p.programType || "미기재"],
  ];
  return (
    <dl className="detail-facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Classification({ posting: p }: { posting: Posting }) {
  if (!p.classification) return null;
  const needsReview = p.classification.needsReview || p.classificationStale;
  return (
    <section className="detail-ai">
      <h3>
        <Sparkles size={17} />
        {p.classificationSource === "sample" ? "직군 분류 예시" : "업무로 살펴본 직군"}
        <span className="role-tag">{p.classification.primaryRole}</span>
      </h3>
      <p>{p.classification.summary}</p>
      {needsReview && <p className="review-text">원문 변경 또는 모호한 업무로 관리자 검토가 필요합니다.</p>}
      <details>
        <summary>분류 근거 보기</summary>
        {p.classification.evidence.map((e, i) => (
          <blockquote key={i}>{e.quote}</blockquote>
        ))}
      </details>
    </section>
  );
}

const REQUIREMENT_LABELS = { listed: "지정 전공만 지원", any: "전공 무관", unknown: "원문 확인 필요" } as const;

function Majors({ posting: p, major }: { posting: Posting; major: Major | null }) {
  const m = p.classification?.majors;
  if (!m) return null;
  const fit = majorFit(p, major);
  const rows: [string, readonly string[]][] = [
    ["지원 가능 전공", m.required],
    ["우대 전공", m.preferred],
    ["업무와 이어지는 전공", m.related],
  ];
  return (
    <section className="detail-section">
      <h3>전공</h3>
      {fit !== "none" && <p className={`major-fit ${fit}`}>{MAJOR_FIT_LABELS[fit]}</p>}
      <dl className="event-list">
        <div>
          <dt>지원 조건</dt>
          <dd>{REQUIREMENT_LABELS[m.requirement]}</dd>
        </div>
        {rows
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{list.join(", ")}</dd>
            </div>
          ))}
      </dl>
      <p className="muted small">AI가 원문을 읽고 정리한 참고 정보입니다. 지원 자격은 원문에서 꼭 확인하세요.</p>
    </section>
  );
}

function Events({ posting: p }: { posting: Posting }) {
  if (!p.events.length) return null;
  return (
    <section className="detail-section">
      <h3>선발 일정</h3>
      <dl className="event-list">
        {p.events.map((e, i) => (
          <div key={i}>
            <dt>{e.label}</dt>
            <dd>{e.raw}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">결과 발표일과 HY-WEP 탈락 처리 완료 시각은 다를 수 있습니다.</p>
    </section>
  );
}

export function PostingDetail({ posting: p, major, applications, now, saved, onFavorite, close, onPlan }: Props) {
  const decision = eligibility(p, applications, now);
  const sections: [string, string][] = [
    ["실습정보", p.practiceInfo],
    ["실습내용", p.tasks],
    ["자격사항", p.qualifications],
    ["근무 조건", p.benefits],
  ];
  return (
    <Modal close={close} label={`${p.company} 공고 상세`}>
      <div className="modal-top">
        <button className="icon-button" aria-label="상세 닫기" onClick={close}>
          <X size={21} />
        </button>
      </div>
      <div className="detail-heading">
        <span className="company-logo logo-0">{p.company.slice(0, 1)}</span>
        <div>
          <p>
            {p.company} · {p.department}
          </p>
          <h2>{p.title}</h2>
        </div>
      </div>
      <div className={`decision decision-${decision.status}`}>
        <Clock3 size={18} />
        <div>
          <b>{decision.label}</b>
          <p>{decision.reason}</p>
        </div>
      </div>
      <Facts posting={p} />
      <Classification posting={p} />
      <Majors posting={p} major={major} />
      {sections.map(([label, value]) => (
        <section className="detail-section" key={label}>
          <h3>{label}</h3>
          <p>{value || "원문 미기재"}</p>
        </section>
      ))}
      <Events posting={p} />
      <div className="detail-timestamps">
        <span>최초 발견 {formatDate(p.firstSeenAt, true)}</span>
        <span>최근 변경 {formatDate(p.updatedAt, true)}</span>
        <span>최근 확인 {formatDate(p.lastCheckedAt, true)}</span>
      </div>
      <div className="detail-actions">
        <button className={`secondary-button ${saved ? "text-blue" : ""}`} onClick={onFavorite}>
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
          {saved ? "관심 저장됨" : "관심 저장"}
        </button>
        <button className="secondary-button" onClick={onPlan}>
          지원 일정 보기
        </button>
        <a className="primary-button" href={p.sourceUrl} target="_blank" rel="noreferrer">
          HY-WEP에서 확인 <ExternalLink size={14} />
        </a>
      </div>
    </Modal>
  );
}
