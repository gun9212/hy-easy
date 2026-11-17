"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { filterPostings, isNewPosting, type Application, type Filters, type Posting } from "@/lib/domain";
import { matchesWhen, nextDeadline } from "@/lib/posting-format";
import type { Major } from "@/lib/majors";
import { DeadlineGroups } from "./deadline-groups";
import { ListFilters } from "./list-filters";
import { PostingResults } from "./posting-results";
import type { RowProps } from "./posting-row-parts";
import { SummaryCards, type Stats } from "./summary-cards";

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
  stats: Stats;
  onCompare: (id: string) => void;
  onOpenCompare: () => void;
  onOpen: (p: Posting) => void;
  onFavorite: (id: string) => void;
  onPlanner: () => void;
};

const DEFAULT_SORT = "deadline";
const WHEN_TITLES: Record<string, string> = { open: "모집 중인 공고", soon: "마감 임박", new: "새로 올라온 공고" };

/** The page title for the list: 관심 공고, a side-nav shortcut, the chosen role, or 전체 공고 (as in the demo). */
export function listTitle(filters: Filters): string {
  if (filters.saved === "true") return "관심 공고";
  return WHEN_TITLES[filters.when ?? ""] ?? (filters.role || "전체 공고");
}

export function PostingsView(props: Props): React.ReactElement {
  const { postings, favoriteIds, now } = props;
  // Deadline order is the default, as in the demo: the list opens on the deadline groups.
  const filters: Filters = { ...props.filters, sort: props.filters.sort || DEFAULT_SORT };
  const filtered = filterPostings(postings, filters, favoriteIds, props.major).filter(p =>
    matchesWhen(p, filters.when, now),
  );
  // With a major chosen, postings only other majors can apply to are hidden; show how many, and the narrower count.
  const majorCounts = props.major
    ? {
        all: filterPostings(postings, { ...filters, mine: "", others: "true" }, favoriteIds, props.major).length,
        related: filterPostings(postings, { ...filters, mine: "true", others: "" }, favoriteIds, props.major).length,
      }
    : null;
  const rowProps: RowProps = {
    postings: filtered,
    applications: props.applications,
    favoriteIds,
    compared: props.compared,
    now,
    major: props.major,
    onCompare: props.onCompare,
    onOpen: props.onOpen,
    onFavorite: props.onFavorite,
  };
  const savedView = filters.saved === "true";
  return (
    <VStack gap={4}>
      <SummaryCards
        stats={props.stats}
        newCount={postings.filter(p => isNewPosting(p, now)).length}
        next={nextDeadline(postings, now)}
      />
      <Card padding={4}>
        <ListFilters
          postings={postings}
          filters={filters}
          updateFilters={props.updateFilters}
          major={props.major}
          onMajor={props.onMajor}
          total={filtered.length}
          majorCounts={majorCounts}
        />
      </Card>
      {filtered.length === 0 ? (
        <EmptyState
          title={savedView ? "저장한 관심 공고가 없어요" : "조건에 맞는 공고가 없어요"}
          description={
            savedView ? "마음에 드는 공고의 북마크를 눌러 모아보세요." : "검색어나 필터를 바꿔 다시 찾아보세요."
          }
          actions={<Button variant="secondary" label="전체 공고 보기" onClick={props.resetFilters} />}
        />
      ) : filters.sort === "deadline" ? (
        <DeadlineGroups {...rowProps} />
      ) : (
        // Keyed by the filters so "더 보기" starts over at 20 whenever the list changes.
        <PostingResults key={JSON.stringify(filters)} {...rowProps} />
      )}
      <Text type="supporting">
        지원 전 원문의 모집 상태와 자격사항을 꼭 확인해 주세요. 일정상 지원 가능 여부는 실제 지원을 보장하지 않습니다.
      </Text>
    </VStack>
  );
}
