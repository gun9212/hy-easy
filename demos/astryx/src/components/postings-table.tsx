"use client";

import { useMemo, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, pixel, proportional, useTableGroupedRows } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import type { TableColumn } from "@astryxdesign/core/Table";
import type { Posting } from "@lib/domain";
import {
  DEADLINE_GROUPS,
  competition,
  deadlineGroup,
  deadlineLabel,
  deadlineShort,
  isClosed,
  isNew,
  isSoon,
  roleOf,
  type DeadlineGroup,
} from "./format";

type Props = { postings: Posting[]; now: string; onOpen: (posting: Posting) => void };

function DeadlineCell({ posting, now }: { posting: Posting; now: string }): React.ReactElement {
  const label = deadlineLabel(posting, now);
  return (
    <VStack gap={0.5} align="start">
      {isSoon(posting, now) ? (
        <Badge variant="warning" label={label} />
      ) : (
        <Text weight="semibold" hasTabularNumbers>
          {label}
        </Text>
      )}
      <Text type="supporting" hasTabularNumbers>
        {deadlineShort(posting)}
      </Text>
    </VStack>
  );
}

function TitleCell({ posting, now, onOpen }: { posting: Posting; now: string } & Pick<Props, "onOpen">) {
  return (
    <VStack gap={0.5}>
      <HStack gap={1.5} align="center">
        <button
          type="button"
          className="posting-link"
          data-closed={isClosed(posting, now) ? "" : undefined}
          onClick={() => onOpen(posting)}
        >
          {posting.title}
        </button>
        {isNew(posting, now) && <Badge variant="info" label="신규" />}
      </HStack>
      <Text type="supporting">
        {posting.company} · {posting.department}
      </Text>
    </VStack>
  );
}

function buildColumns(now: string, onOpen: Props["onOpen"]): TableColumn<Posting>[] {
  return [
    { key: "deadline", header: "마감", width: pixel(104), renderCell: p => <DeadlineCell posting={p} now={now} /> },
    {
      key: "title",
      header: "공고",
      width: proportional(3, { minWidth: 260 }),
      renderCell: p => <TitleCell posting={p} now={now} onOpen={onOpen} />,
    },
    {
      key: "role",
      header: "직무",
      width: proportional(1, { minWidth: 96 }),
      renderCell: p => <Text>{roleOf(p) ?? "미분류"}</Text>,
    },
    {
      key: "location",
      header: "지역 · 기간",
      width: proportional(1.4, { minWidth: 140 }),
      renderCell: p => (
        <VStack gap={0.5}>
          <Text>{p.location}</Text>
          <Text type="supporting">{p.term}</Text>
        </VStack>
      ),
    },
    {
      key: "stipend",
      header: "실습지원비",
      width: pixel(112),
      align: "end",
      renderCell: p =>
        p.stipend.amount ? (
          <HStack gap={0.5} align="end" justify="end">
            <Text type="supporting">월</Text>
            <Text weight="bold" size="lg" hasTabularNumbers>
              {Math.round(p.stipend.amount / 10000)}
            </Text>
            <Text type="supporting">만원</Text>
          </HStack>
        ) : (
          <Text type="supporting">미기재</Text>
        ),
    },
    {
      key: "applicants",
      header: "경쟁률",
      width: pixel(132),
      align: "end",
      renderCell: p => (
        <VStack gap={0.5} align="end">
          <Text hasTabularNumbers weight="semibold">
            {competition(p)}
          </Text>
          <Text type="supporting" hasTabularNumbers>
            지원 {p.applicants ?? "-"} · 모집 {p.headcount ?? "-"}
          </Text>
        </VStack>
      ),
    },
  ];
}

function GroupHeader({ group, count }: { group: DeadlineGroup; count: number }): React.ReactElement {
  return (
    <HStack gap={2} align="center">
      <Text weight="bold">{group}</Text>
      {group === "3일 안에 마감" ? <Badge variant="warning" label={`${count}건`} /> : <Text type="supporting">{count}건</Text>}
    </HStack>
  );
}

function toggled(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Rows grouped by how soon they close; closed postings start collapsed. Only for the deadline order. */
export function PostingsTable({ postings, now, onOpen, isGrouped }: Props & { isGrouped: boolean }): React.ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["마감된 공고"]));
  const columns = useMemo(() => buildColumns(now, onOpen), [now, onOpen]);
  const grouped = useTableGroupedRows<Posting>({
    data: postings,
    groupBy: p => deadlineGroup(p, now),
    groupOrder: [...DEADLINE_GROUPS],
    collapsedGroups: collapsed,
    onToggleGroup: key => setCollapsed(prev => toggled(prev, key)),
    renderGroupHeader: (key, count) => <GroupHeader group={key as DeadlineGroup} count={count} />,
    getRowKey: p => p.id,
  });
  const common = { columns, density: "balanced", hasHover: true, verticalAlign: "middle" } as const;
  return isGrouped ? (
    <Table<Posting> {...common} data={grouped.data} idKey={grouped.idKey} plugins={{ grouped: grouped.plugin }} />
  ) : (
    <Table<Posting> {...common} data={postings} idKey="id" />
  );
}
