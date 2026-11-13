"use client";

import { useMemo } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { periodMonths } from "@/lib/filter-options";
import { deadlineLabel, eligibility, isNewPosting, stipendLabel, type Posting } from "@/lib/domain";
import {
  BookmarkButton,
  CompareBox,
  DeadlineBadge,
  MajorFitBadge,
  competitionLabel,
  type RowProps,
} from "./posting-row-parts";

function TitleCell({ posting: p, props }: { posting: Posting; props: RowProps }): React.ReactElement {
  const months = periodMonths(p.period);
  const closed = eligibility(p, props.applications, props.now).status === "closed";
  return (
    <VStack gap={0.5}>
      <HStack gap={1} align="center" wrap="wrap">
        <Text type="supporting">{p.company}</Text>
        {isNewPosting(p, props.now) && <Badge variant="info" label="신규" />}
        <MajorFitBadge posting={p} major={props.major} />
      </HStack>
      <button type="button" className="row-link" data-closed={closed ? "" : undefined} onClick={() => props.onOpen(p)}>
        {p.title}
      </button>
      {p.classification?.summary && (
        <Text size="sm" color="secondary" maxLines={1}>
          {p.classification.summary}
        </Text>
      )}
      <HStack gap={1.5} align="center" wrap="wrap">
        <Text type="supporting">{p.department}</Text>
        <HStack gap={0.5} align="center">
          <MapPin size={12} aria-hidden="true" />
          <Text type="supporting">{p.location}</Text>
        </HStack>
        {months !== null && <Text type="supporting">{months}개월</Text>}
      </HStack>
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

function buildColumns(props: RowProps): TableColumn<Posting>[] {
  return [
    {
      key: "select",
      header: "비교",
      width: pixel(56),
      renderCell: p => <CompareBox posting={p} checked={props.compared.includes(p.id)} onCompare={props.onCompare} />,
    },
    {
      key: "title",
      header: "기업 · 실습 직무",
      width: proportional(3, { minWidth: 300 }),
      renderCell: p => <TitleCell posting={p} props={props} />,
    },
    {
      key: "role",
      header: "직군",
      width: proportional(1, { minWidth: 104 }),
      renderCell: p => <RoleCell posting={p} />,
    },
    {
      key: "stipend",
      header: "지원금",
      width: pixel(150),
      align: "end",
      renderCell: p => (
        <VStack gap={0.5} align="end">
          <Text weight="bold" hasTabularNumbers>
            {stipendLabel(p)}
          </Text>
          <Text type="supporting">{competitionLabel(p)}</Text>
        </VStack>
      ),
    },
    {
      key: "deadline",
      header: "마감",
      width: pixel(128),
      renderCell: p => (
        <VStack gap={0.5} align="start">
          <DeadlineBadge posting={p} applications={props.applications} now={props.now} />
          <Text type="supporting" hasTabularNumbers>
            {deadlineLabel(p)}
          </Text>
        </VStack>
      ),
    },
    {
      key: "save",
      header: "관심",
      width: pixel(64),
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
