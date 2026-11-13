"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import type { TableColumn } from "@astryxdesign/core/Table";
import type { Posting } from "@lib/domain";
import { daysLeft, deadlineDetail, deadlineLabel, isNew, roleColor } from "./format";

type Props = { postings: Posting[]; now: string; onOpen: (posting: Posting) => void };

function DeadlineCell({ posting, now }: { posting: Posting; now: string }): React.ReactElement {
  const days = daysLeft(posting, now);
  const urgent = posting.recruitment === "open" && days !== null && days <= 3;
  return (
    <VStack gap={0.5}>
      {urgent ? (
        <Badge variant="warning" label={deadlineLabel(posting, now)} />
      ) : (
        <Text weight="semibold" hasTabularNumbers>
          {deadlineLabel(posting, now)}
        </Text>
      )}
      <Text type="supporting" hasTabularNumbers>
        {deadlineDetail(posting)}
      </Text>
    </VStack>
  );
}

function buildColumns(now: string, onOpen: Props["onOpen"]): TableColumn<Posting>[] {
  return [
    {
      key: "deadline",
      header: "마감",
      width: pixel(120),
      renderCell: posting => <DeadlineCell posting={posting} now={now} />,
    },
    {
      key: "title",
      header: "공고",
      width: proportional(3, { minWidth: 260 }),
      renderCell: posting => (
        <VStack gap={0.5} align="start">
          <HStack gap={1} align="center">
            <Button variant="ghost" size="sm" label={posting.title} onClick={() => onOpen(posting)} />
            {isNew(posting, now) && <Badge variant="info" label="신규" />}
          </HStack>
          <Text type="supporting">
            {posting.company} · {posting.department}
          </Text>
        </VStack>
      ),
    },
    {
      key: "role",
      header: "직무",
      width: pixel(120),
      renderCell: posting => {
        const role = posting.classification?.primaryRole;
        return role ? <Badge variant={roleColor(role)} label={role} /> : <Text type="supporting">미분류</Text>;
      },
    },
    { key: "location", header: "지역", width: proportional(1, { minWidth: 110 }) },
    {
      key: "stipend",
      header: "실습지원비",
      width: pixel(130),
      align: "end",
      renderCell: posting => <Text hasTabularNumbers>{posting.stipend.raw}</Text>,
    },
    {
      key: "applicants",
      header: "지원/모집",
      width: pixel(100),
      align: "end",
      renderCell: posting => (
        <Text hasTabularNumbers>
          {posting.applicants ?? "-"} / {posting.headcount ?? "-"}
        </Text>
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
      density="balanced"
      hasHover
      verticalAlign="middle"
    />
  );
}
