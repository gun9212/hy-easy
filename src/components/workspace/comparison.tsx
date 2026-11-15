"use client";

import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { deadlineLabel, eligibility, stipendLabel, type Application, type Posting } from "@/lib/domain";
import { Modal } from "./modal";

type Props = { postings: Posting[]; close: () => void; applications: Application[]; now: Date };
type Row = [label: string, render: (p: Posting) => ReactNode];
/** How much of an attached file's text the side-by-side table shows; the detail has the rest. */
const COMPARE_ATTACHMENT_CHARS = 400;

export function Comparison({ postings, close, applications, now }: Props) {
  const rows: Row[] = [
    ["직군", p => p.classification?.primaryRole ?? "분류 대기"],
    [
      "실습내용",
      p =>
        p.attachment ? `${p.tasks}\n\n[첨부 파일] ${p.attachment.text.slice(0, COMPARE_ATTACHMENT_CHARS)}…` : p.tasks,
    ],
    ["자격사항", p => p.qualifications],
    ["지원금", stipendLabel],
    ["실습 기간", p => p.period],
    ["지역", p => p.location],
    ["마감시간", deadlineLabel],
    ["모집 / 지원 인원", p => `${p.headcount ?? "?"}명 / ${p.applicants ?? "?"}명`],
    ["나의 지원 가능 여부", p => eligibility(p, applications, now).label],
  ];
  return (
    <Modal close={close} label="선택 공고 비교" wide>
      <div className="modal-top">
        <h2>같은 기준으로, 나란히 비교</h2>
        <button className="icon-button" aria-label="비교 닫기" onClick={close}>
          <X size={21} />
        </button>
      </div>
      {postings.length > 1 && <p className="compare-hint">옆으로 밀어서 다른 공고를 볼 수 있어요.</p>}
      <div className="comparison-scroll">
        <table className="comparison-table" style={{ "--compare-columns": postings.length } as CSSProperties}>
          <thead>
            <tr>
              <th>비교 항목</th>
              {postings.map(p => (
                <th key={p.id}>
                  <span className="company-logo logo-0">{p.company.slice(0, 1)}</span>
                  <h3>{p.company}</h3>
                  <p>{p.title}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, render]) => (
              <tr key={label}>
                <th>{label}</th>
                {postings.map(p => (
                  <td key={p.id}>{render(p) || "미기재"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        지원금은 지급 단위를 함께 확인하세요. 미기재·시급·총액은 월 지급액과 직접 비교하지 않습니다.
      </p>
    </Modal>
  );
}
