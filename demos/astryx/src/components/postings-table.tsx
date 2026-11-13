"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import type { TableColumn } from "@astryxdesign/core/Table";
import type { Posting } from "@lib/domain";
import { competition, deadlineLabel, deadlineShort, isClosed, isNew, isSoon, roleOf } from "./format";

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
      renderCell: p => (
        <Text hasTabularNumbers color={p.stipend.amount ? "primary" : "secondary"}>
          {p.stipend.raw}
        </Text>
      ),
    },
    {
      key: "applicants",
      header: "경쟁률",
      width: pixel(104),
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

export function PostingsTable({ postings, now, onOpen }: Props): React.ReactElement {
  return (
    <Table<Posting>
      data={postings}
      columns={buildColumns(now, onOpen)}
      idKey="id"
      density="compact"
      hasHover
      verticalAlign="middle"
    />
  );
}
