"use client";

import { useMemo } from "react";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { periodMonths } from "@/lib/filter-options";
import { eligibility, isNewPosting, type Posting } from "@/lib/domain";
import { deadlineShort, postedShort } from "@/lib/posting-format";
import {
  BookmarkButton,
  CompareBox,
  Competition,
  DeadlineBadge,
  MajorFitBadge,
  StipendAmount,
  type RowProps,
} from "./posting-row-parts";

function DeadlineCell({ posting: p, props }: { posting: Posting; props: RowProps }): React.ReactElement {
  return (
    <VStack gap={0.5} align="start">
      <DeadlineBadge posting={p} applications={props.applications} now={props.now} />
      <Text type="supporting" hasTabularNumbers>
        {deadlineShort(p)}
      </Text>
      {postedShort(p) && (
        <Text type="supporting" size="sm" hasTabularNumbers>
          {postedShort(p)} 등록
        </Text>
      )}
    </VStack>
  );
}

function TitleCell({ posting: p, props }: { posting: Posting; props: RowProps }): React.ReactElement {
  const closed = eligibility(p, props.applications, props.now).status === "closed";
  return (
    <VStack gap={0.5}>
      <HStack gap={1} align="center" wrap="wrap">
        <button
          type="button"
          className="row-link"
          data-closed={closed ? "" : undefined}
          onClick={() => props.onOpen(p)}
        >
          {p.title}
        </button>
        {isNewPosting(p, props.now) && <span className="new-mark">신규</span>}
        <MajorFitBadge posting={p} major={props.major} />
      </HStack>
      <Text type="supporting">
        {p.company} · {p.department}
      </Text>
      {p.classification?.summary && (
        <Text size="sm" color="secondary" maxLines={1}>
          {p.classification.summary}
        </Text>
      )}
    </VStack>
  );
}

function RoleCell({ posting: p }: { posting: Posting }): React.ReactElement {
  const review = Boolean(p.classification?.needsReview || p.classificationStale);
  return (
    <VStack gap={0.5} align="start">
      <Text>{p.classification?.primaryRole ?? "분류 대기"}</Text>
      {review && <Text type="supporting">검토 필요</Text>}
    </VStack>
  );
}

function PlaceCell({ posting: p }: { posting: Posting }): React.ReactElement {
  const months = periodMonths(p.period);
  return (
    <VStack gap={0.5}>
      <Text>{p.location || "미기재"}</Text>
      <Text type="supporting">{[p.term, months !== null ? `${months}개월` : ""].filter(Boolean).join(" · ")}</Text>
    </VStack>
  );
}

/** The demo's order, deadline first, with the compare box and the bookmark at the two ends. */
function buildColumns(props: RowProps): TableColumn<Posting>[] {
  return [
    {
      key: "select",
      header: "비교",
      width: pixel(56),
      renderCell: p => <CompareBox posting={p} checked={props.compared.includes(p.id)} onCompare={props.onCompare} />,
    },
    { key: "deadline", header: "마감", width: pixel(112), renderCell: p => <DeadlineCell posting={p} props={props} /> },
    {
      key: "title",
      header: "공고",
      width: proportional(3, { minWidth: 260 }),
      renderCell: p => <TitleCell posting={p} props={props} />,
    },
    {
      key: "role",
      header: "직무",
      width: proportional(1, { minWidth: 96 }),
      renderCell: p => <RoleCell posting={p} />,
    },
    {
      key: "place",
      header: "지역 · 기간",
      width: proportional(1.4, { minWidth: 140 }),
      renderCell: p => <PlaceCell posting={p} />,
    },
    {
      key: "stipend",
      header: "실습지원비",
      width: pixel(124),
      align: "end",
      renderCell: p => <StipendAmount posting={p} />,
    },
    {
      key: "competition",
      header: "경쟁률",
      width: pixel(112),
      align: "end",
      renderCell: p => <Competition posting={p} />,
    },
    {
      key: "save",
      header: "관심",
      width: pixel(56),
      align: "center",
      renderCell: p => (
        <BookmarkButton posting={p} saved={props.favoriteIds.includes(p.id)} onFavorite={props.onFavorite} />
      ),
    },
  ];
}

export function PostingsTable(props: RowProps): React.ReactElement {
  const columns = useMemo(() => buildColumns(props), [props]);
  return (
    <Table<Posting>
      columns={columns}
      data={props.postings}
      idKey="id"
      density="balanced"
      hasHover
      verticalAlign="middle"
    />
  );
}
