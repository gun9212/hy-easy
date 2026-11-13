"use client";

import { GitCompareArrows } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { filterPostings, type Application, type Filters, type Posting } from "@/lib/domain";
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

function ListHeader({ props, total }: { props: Props; total: number }): React.ReactElement {
  const { filters, updateFilters, compared } = props;
  return (
    <HStack gap={2} align="center" justify="between" wrap="wrap">
      <HStack gap={2} align="center">
        <Text weight="bold" size="lg">
          {filters.saved === "true" ? "관심 공고" : "전체 공고"}
        </Text>
        <Badge variant="blue" label={total} />
        {filters.role && (
          <Button
            variant="secondary"
            size="sm"
            label={`${filters.role} ✕`}
            onClick={() => updateFilters({ role: "" })}
          />
        )}
      </HStack>
      <Button
        variant="secondary"
        label="공고 비교"
        icon={<GitCompareArrows size={15} />}
        endContent={compared.length > 0 ? <Badge variant="info" label={compared.length} /> : undefined}
        onClick={props.onOpenCompare}
      />
    </HStack>
  );
}

export function PostingsView(props: Props): React.ReactElement {
  const { postings, filters, favoriteIds, now } = props;
  const filtered = filterPostings(postings, filters, favoriteIds, now, props.major);
  // With a major chosen, postings only other majors can apply to are hidden; show how many, and the narrower count.
  const majorCounts = props.major
    ? {
        all: filterPostings(postings, { ...filters, mine: "", others: "true" }, favoriteIds, now, props.major).length,
        related: filterPostings(postings, { ...filters, mine: "true", others: "" }, favoriteIds, now, props.major)
          .length,
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
      <SummaryCards stats={props.stats} favorites={favoriteIds.length} onPlanner={props.onPlanner} />
      <Card padding={4}>
        <VStack gap={3}>
          <ListHeader props={props} total={filtered.length} />
          <ListFilters
            postings={postings}
            filters={filters}
            updateFilters={props.updateFilters}
            major={props.major}
            onMajor={props.onMajor}
            total={filtered.length}
            majorCounts={majorCounts}
          />
        </VStack>
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
