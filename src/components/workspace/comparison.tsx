"use client";

import { ChevronDown, X } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { compareSections } from "@/lib/compare-text";
import { deadlineLabel, eligibility, stipendLabel, type Application, type Posting } from "@/lib/domain";
import { competitionRatio } from "@/lib/posting-format";
import { Modal } from "./modal";

type Props = { postings: Posting[]; close: () => void; applications: Application[]; now: Date };
type Row = [label: string, render: (p: Posting) => ReactNode];
/** How much of an attached file's text the side-by-side table shows; the detail has the rest. */
const COMPARE_ATTACHMENT_CHARS = 400;

function Competition({ posting: p }: { posting: Posting }) {
  return (
    <span className="compare-figure">
      <b>{competitionRatio(p)}</b>
      <span>
        지원 {p.applicants ?? "-"} · 모집 {p.headcount ?? "-"}
      </span>
    </span>
  );
}

/** One-line facts first: they are what the table is for, and they line up across columns. */
function factRows(applications: Application[], now: Date): Row[] {
  return [
    ["직군", p => p.classification?.primaryRole ?? "분류 대기"],
    ["하는 일", p => p.classification?.summary ?? ""],
    ["마감", deadlineLabel],
    ["경쟁률", p => <Competition posting={p} />],
    ["지원금", stipendLabel],
    ["실습 기간", p => p.period],
    ["지역", p => p.location],
    ["나의 지원 가능 여부", p => eligibility(p, applications, now).label],
  ];
}

/** The original text, cut into the school template's sections so the same section sits in one row. */
function SourceRows({ title, texts, count }: { title: string; texts: string[]; count: number }) {
  const rows = compareSections(texts);
  if (!rows.length) return null;
  return (
    <>
      <tr className="compare-group">
        <th colSpan={count + 1}>{title}</th>
      </tr>
      {rows.map(row => (
        <tr key={`${title}-${row.label}`}>
          <th>{row.label}</th>
          {row.cells.map((cell, i) => (
            <td key={i} className="compare-source">
              {cell || <span className="compare-empty">없음</span>}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

type TableProps = Pick<Props, "postings" | "applications" | "now">;

export function ComparisonTable({ postings, applications, now }: TableProps) {
  const [showSource, setShowSource] = useState(false);
  const count = postings.length;
  return (
    <>
      {count > 1 && <p className="compare-hint">옆으로 밀어서 다른 공고를 볼 수 있어요.</p>}
      <div className="comparison-scroll">
        <table className="comparison-table" style={{ "--compare-columns": count } as CSSProperties}>
          <thead>
            <tr>
              <th>비교 항목</th>
              {postings.map(p => (
                <th key={p.id}>
                  <h3>{p.company}</h3>
                  <p>{p.title}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factRows(applications, now).map(([label, render]) => (
              <tr key={label}>
                <th>{label}</th>
                {postings.map(p => (
                  <td key={p.id}>{render(p) || "미기재"}</td>
                ))}
              </tr>
            ))}
            <tr className="compare-toggle-row">
              <td colSpan={count + 1}>
                <button
                  type="button"
                  className="compare-toggle"
                  aria-expanded={showSource}
                  onClick={() => setShowSource(open => !open)}
                >
                  <ChevronDown size={16} aria-hidden="true" />
                  {showSource ? "원문 접기" : "원문 펼치기 · 실습내용과 자격사항을 항목별로 맞춰 보기"}
                </button>
              </td>
            </tr>
            {showSource && (
              <>
                <SourceRows title="실습내용" texts={postings.map(p => p.tasks)} count={count} />
                <SourceRows title="자격사항" texts={postings.map(p => p.qualifications)} count={count} />
                {postings.some(p => p.attachment) && (
                  <tr>
                    <th>첨부 파일</th>
                    {postings.map(p => (
                      <td key={p.id} className="compare-source">
                        {p.attachment ? (
                          `${p.attachment.text.slice(0, COMPARE_ATTACHMENT_CHARS)}…`
                        ) : (
                          <span className="compare-empty">없음</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        지원금은 지급 단위를 함께 확인하세요. 미기재·시급·총액은 월 지급액과 직접 비교하지 않습니다.
      </p>
    </>
  );
}

export function Comparison({ postings, close, applications, now }: Props) {
  return (
    <Modal close={close} label="선택 공고 비교" wide>
      <div className="modal-top">
        <h2>같은 기준으로, 나란히 비교</h2>
        <button className="icon-button" aria-label="비교 닫기" onClick={close}>
          <X size={21} />
        </button>
      </div>
      <ComparisonTable postings={postings} applications={applications} now={now} />
    </Modal>
  );
}
