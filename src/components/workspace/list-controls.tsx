"use client";

// Search box, filter selects and the result/sort bar above the postings table.
import { useMemo } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { ROLES, type Filters, type Posting } from "@/lib/domain";
import { SEOUL_COLLEGES, isMajor, type Major } from "@/lib/majors";
import { durationOptions, regionOptions, stipendOptions, termOptions } from "@/lib/filter-options";
import { FilterSelect } from "./filter-select";

type FilterProps = { postings: Posting[]; filters: Filters; updateFilters: (patch: Filters) => void };
type MajorProps = { major: Major | null; onMajor: (major: Major | null) => void };

function MajorSelect({ major, onMajor }: MajorProps) {
  return (
    <label className={`filter-select major-select ${major ? "has-value" : ""}`}>
      <select
        aria-label="내 전공"
        value={major ?? ""}
        onChange={e => onMajor(isMajor(e.target.value) ? e.target.value : null)}
      >
        <option value="">내 전공 선택</option>
        {SEOUL_COLLEGES.map(c => (
          <optgroup key={c.college} label={c.college}>
            {c.majors.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}

export function SearchAndFilters({ postings, filters, updateFilters, major, onMajor }: FilterProps & MajorProps) {
  const options = useMemo(
    () => ({
      terms: termOptions(postings),
      regions: regionOptions(postings),
      durations: durationOptions(postings),
      stipends: stipendOptions(postings),
    }),
    [postings],
  );
  return (
    <div className="search-filter-row">
      <label className="search-field">
        <Search size={18} />
        <input
          aria-label="기업명, 직무, 기술 검색"
          placeholder="기업명, 직무 또는 기술을 검색해 보세요"
          value={filters.q ?? ""}
          onChange={e => updateFilters({ q: e.target.value })}
        />
        {filters.q && (
          <button aria-label="검색어 지우기" onClick={() => updateFilters({ q: "" })}>
            <X size={15} />
          </button>
        )}
      </label>
      <div className="filter-controls">
        <MajorSelect major={major} onMajor={onMajor} />
        <FilterSelect
          label="직군"
          value={filters.role ?? ""}
          onChange={role => updateFilters({ role })}
          options={ROLES.map(r => [r, r] as const)}
        />
        <FilterSelect
          label="학기"
          value={filters.term ?? ""}
          onChange={term => updateFilters({ term })}
          options={options.terms}
        />
        <FilterSelect
          label="지역"
          value={filters.location ?? ""}
          onChange={location => updateFilters({ location })}
          options={options.regions}
        />
        <FilterSelect
          label="실습 기간"
          value={filters.duration ?? ""}
          onChange={duration => updateFilters({ duration })}
          options={options.durations}
        />
        <FilterSelect
          label="지원금"
          value={filters.stipend ?? ""}
          onChange={stipend => updateFilters({ stipend })}
          options={options.stipends}
        />
      </div>
    </div>
  );
}

/** Counts behind the major options: without the major restriction, and with "내 전공 관련만". */
export type MajorCounts = { all: number; related: number };

export function ListMeta({
  total,
  filters,
  updateFilters,
  majorCounts,
}: { total: number; majorCounts: MajorCounts | null } & Omit<FilterProps, "postings">) {
  const hidden = majorCounts ? majorCounts.all - total : 0;
  return (
    <div className="list-meta">
      <span>
        총 <b>{total}</b>개의 공고
        {majorCounts && hidden > 0 && <small className="list-meta-note"> · 전체 {majorCounts.all}개</small>}
      </span>
      <div>
        {majorCounts && (
          <>
            <label className="check-label">
              <input
                type="checkbox"
                checked={filters.mine === "true"}
                onChange={e => updateFilters({ mine: e.target.checked ? "true" : "" })}
              />
              내 전공 관련만 ({majorCounts.related})
            </label>
            <span className="vertical-line" />
            <label className="check-label">
              <input
                type="checkbox"
                checked={filters.others === "true"}
                onChange={e => updateFilters({ others: e.target.checked ? "true" : "" })}
              />
              다른 전공 대상도 보기
            </label>
            <span className="vertical-line" />
          </>
        )}
        <label className="sort-label">
          <SlidersHorizontal size={13} />
          <select
            aria-label="공고 정렬"
            value={filters.sort ?? "latest"}
            onChange={e => updateFilters({ sort: e.target.value })}
          >
            <option value="latest">최신순</option>
            <option value="deadline">마감 임박순</option>
            <option value="stipend">지원금 높은순</option>
          </select>
          <ChevronDown size={12} />
        </label>
      </div>
    </div>
  );
}
