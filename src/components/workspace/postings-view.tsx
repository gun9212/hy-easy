"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { filterPostings, type Application, type Filters, type Posting } from "@/lib/domain";
import type { Major } from "@/lib/majors";
import { ListMeta, SearchAndFilters } from "./list-controls";
import { PostingsTable } from "./postings-table";

const PAGE_SIZE = 10;

type Props = {
  postings: Posting[];
  filters: Filters;
  major: Major | null;
  onMajor: (major: Major | null) => void;
  updateFilters: (patch: Filters) => void;
  resetFilters: () => void;
  favoriteIds: string[];
  applications: Application[];
  compared: string[];
  now: Date;
  stats: { open: number; closingSoon: number; activeCompany: string | null; hasActive: boolean };
  onCompare: (id: string) => void;
  onOpenCompare: () => void;
  onOpen: (p: Posting) => void;
  onFavorite: (id: string) => void;
  onPlanner: () => void;
};

function Overview({
  stats,
  favorites,
  onPlanner,
}: {
  stats: Props["stats"];
  favorites: number;
  onPlanner: () => void;
}) {
  return (
    <div className="overview-strip">
      <div>
        <span>모집 중인 공고</span>
        <b>
          {stats.open}
          <small>개</small>
        </b>
      </div>
      <div>
        <span>3일 이내 마감</span>
        <b>
          {stats.closingSoon}
          <small>개</small>
        </b>
      </div>
      <div>
        <span>관심 공고</span>
        <b>
          {favorites}
          <small>개</small>
        </b>
      </div>
      <button className="overview-action" onClick={onPlanner}>
        <span className="overview-icon">
          <CalendarClock size={21} />
        </span>
        <span>
          <b>{stats.activeCompany ? `${stats.activeCompany} 지원 진행 중` : "지원을 시작하기 전, 일정부터"}</b>
          <small>
            {stats.hasActive
              ? "시스템 탈락 처리 완료 후 다음 지원이 가능해요."
              : "한 번에 한 기업, 다음 지원 일정까지 살펴보세요."}
          </small>
        </span>
        <ArrowRight size={18} />
      </button>
    </div>
  );
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const range = total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)}` : "0";
  return (
    <div className="pagination-row">
      <span>
        {range} / {total}개
      </span>
      <div>
        <button className="page-button" aria-label="이전 페이지" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={15} />
        </button>
        {Array.from({ length: pages }, (_, i) => (
          <button
            key={i}
            className={`page-button ${page === i + 1 ? "active" : ""}`}
            aria-label={`${i + 1}페이지`}
            aria-current={page === i + 1 ? "page" : undefined}
            onClick={() => onPage(i + 1)}
          >
            {i + 1}
          </button>
        ))}
        <button
          className="page-button"
          aria-label="다음 페이지"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <span>한 페이지에 {PAGE_SIZE}개</span>
    </div>
  );
}

function EmptyState({ savedView, onReset }: { savedView: boolean; onReset: () => void }) {
  return (
    <div className="empty-state">
      <Search size={30} />
      <h3>{savedView ? "저장한 관심 공고가 없어요" : "조건에 맞는 공고가 없어요"}</h3>
      <p>{savedView ? "마음에 드는 공고의 북마크를 눌러 모아보세요." : "검색어나 필터를 바꿔 다시 찾아보세요."}</p>
      <button className="secondary-button" onClick={onReset}>
        전체 공고 보기
      </button>
    </div>
  );
}

export function PostingsView(props: Props) {
  const { postings, filters, updateFilters, favoriteIds, compared, now } = props;
  const filtered = filterPostings(postings, filters, favoriteIds, now, props.major);
  // With a major chosen, postings only other majors can apply to are hidden; show how many, and the narrower count.
  const majorCounts = props.major
    ? {
        all: filterPostings(postings, { ...filters, mine: "", others: "true" }, favoriteIds, now, props.major).length,
        related: filterPostings(postings, { ...filters, mine: "true", others: "" }, favoriteIds, now, props.major)
          .length,
      }
    : null;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(filters.page) || 1), pages);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const indexById = useMemo(() => new Map(postings.map((p, i) => [p.id, i])), [postings]);

  return (
    <>
      <Overview stats={props.stats} favorites={favoriteIds.length} onPlanner={props.onPlanner} />
      <section className="listing-section" aria-label="공고 탐색">
        <div className="list-toolbar">
          <div className="list-tabs">
            <button
              className={!filters.role ? "list-tab active" : "list-tab"}
              onClick={() => updateFilters({ role: "" })}
            >
              전체 공고 <span>{filtered.length}</span>
            </button>
            {filters.role && (
              <span className="active-role-label">
                {filters.role}
                <button aria-label="직군 필터 해제" onClick={() => updateFilters({ role: "" })}>
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
          <button className="secondary-button compare-top" onClick={props.onOpenCompare}>
            <GitCompareArrows size={15} />
            공고 비교 {compared.length > 0 && <b>{compared.length}</b>}
          </button>
        </div>
        <SearchAndFilters
          postings={postings}
          filters={filters}
          updateFilters={updateFilters}
          major={props.major}
          onMajor={props.onMajor}
        />
        <ListMeta total={filtered.length} filters={filters} updateFilters={updateFilters} majorCounts={majorCounts} />
        {visible.length ? (
          <PostingsTable
            postings={visible}
            logoIndex={p => indexById.get(p.id) ?? 0}
            applications={props.applications}
            favoriteIds={favoriteIds}
            compared={compared}
            now={now}
            major={props.major}
            onCompare={props.onCompare}
            onOpen={props.onOpen}
            onFavorite={props.onFavorite}
          />
        ) : (
          <EmptyState savedView={filters.saved === "true"} onReset={props.resetFilters} />
        )}
        <Pagination page={page} total={filtered.length} onPage={next => updateFilters({ page: String(next) })} />
      </section>
      <div className="source-note">
        <ShieldCheck size={15} />
        <span>
          지원 전 원문의 모집 상태와 자격사항을 꼭 확인해 주세요. 일정상 지원 가능 여부는 실제 지원을 보장하지 않습니다.
        </span>
        <a href="https://hywep.hanyang.ac.kr/" target="_blank" rel="noreferrer">
          원문 확인 <ArrowUpRight size={12} />
        </a>
      </div>
    </>
  );
}
