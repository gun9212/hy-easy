"use client";

import { ArrowDown, Bookmark, Info, MapPin } from "lucide-react";
import { periodMonths } from "@/lib/filter-options";
import {
  deadlineLabel,
  eligibility,
  isNewPosting,
  remainingDays,
  stipendLabel,
  type Application,
  type Posting,
} from "@/lib/domain";

type Props = {
  postings: Posting[];
  logoIndex: (p: Posting) => number;
  applications: Application[];
  favoriteIds: string[];
  compared: string[];
  now: Date;
  onCompare: (id: string) => void;
  onOpen: (p: Posting) => void;
  onFavorite: (id: string) => void;
};

function deadlineBadge(closed: boolean, days: number | null): { className: string; text: string } {
  if (closed) return { className: "deadline-badge closed", text: "마감" };
  if (days === null) return { className: "deadline-badge", text: "확인 필요" };
  if (days === 0) return { className: "deadline-badge urgent", text: "오늘 마감" };
  return { className: days <= 3 ? "deadline-badge urgent" : "deadline-badge", text: `D-${Math.max(0, days)}` };
}

function RoleCell({ posting: p }: { posting: Posting }) {
  const review = Boolean(p.classification?.needsReview || p.classificationStale);
  return (
    <td data-label="직군">
      <span className={`role-tag ${review ? "review" : ""}`}>{p.classification?.primaryRole ?? "분류 대기"}</span>
      {review && <span className="review-caption">검토 필요</span>}
    </td>
  );
}

export function PostingsTable(props: Props) {
  const { postings, logoIndex, applications, favoriteIds, compared, now, onCompare, onOpen, onFavorite } = props;
  return (
    <div className="postings-table-wrap">
      <table className="postings-table">
        <thead>
          <tr>
            <th className="select-cell">
              <span className="sr-only">비교 선택</span>
            </th>
            <th>기업 · 실습 직무</th>
            <th>직군</th>
            <th>
              지원금 <Info size={11} />
            </th>
            <th>
              마감일 <ArrowDown size={11} />
            </th>
            <th className="save-cell">
              <span className="sr-only">관심 공고</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {postings.map(p => {
            const closed = eligibility(p, applications, now).status === "closed";
            const badge = deadlineBadge(closed, remainingDays(p, now));
            const saved = favoriteIds.includes(p.id);
            const months = periodMonths(p.period);
            return (
              <tr key={p.id} className={compared.includes(p.id) ? "row-selected" : ""}>
                <td className="select-cell">
                  <input
                    type="checkbox"
                    aria-label={`${p.company} ${p.title} 비교 선택`}
                    checked={compared.includes(p.id)}
                    onChange={() => onCompare(p.id)}
                  />
                </td>
                <td className="company-cell">
                  <button className="posting-link" onClick={() => onOpen(p)}>
                    <span className={`company-logo logo-${logoIndex(p) % 5}`}>{p.company.slice(0, 1)}</span>
                    <span className="posting-info">
                      <span className="company-name">
                        {p.company}
                        {isNewPosting(p, now) && <span className="new-badge">NEW</span>}
                      </span>
                      <b>{p.title}</b>
                      <span className="posting-subline">
                        <span>{p.department}</span>
                        <i /> <MapPin size={11} />
                        {p.location}
                        {months !== null && (
                          <span className="period-mobile-hide">
                            <i />
                            {months}개월
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </td>
                <RoleCell posting={p} />
                <td data-label="지원금" className="stipend-cell">
                  <b>{stipendLabel(p)}</b>
                  <small>
                    {p.applicants !== null && p.headcount ? `${p.headcount}명 모집 · ${p.applicants}명 지원` : p.term}
                  </small>
                </td>
                <td data-label="마감" className="deadline-cell">
                  <span className={badge.className}>{badge.text}</span>
                  <small>{deadlineLabel(p)}</small>
                </td>
                <td className="save-cell">
                  <button
                    className={`bookmark-button ${saved ? "saved" : ""}`}
                    aria-label={`${p.company} ${p.title} ${saved ? "관심 해제" : "관심 저장"}`}
                    aria-pressed={saved}
                    onClick={() => onFavorite(p.id)}
                  >
                    <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
