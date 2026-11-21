"use client";

import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { Posting } from "@/lib/domain";

export type Stats = { open: number; closingSoon: number; activeCompany: string | null; hasActive: boolean };

function Stat(props: { label: string; value: number; note: string; isUrgent?: boolean }): React.ReactElement {
  return (
    <Card padding={4}>
      <VStack gap={1.5}>
        <Text type="supporting">{props.label}</Text>
        <HStack gap={1} align="end">
          <span className="stat-value" data-urgent={props.isUrgent && props.value > 0 ? "" : undefined}>
            <Text type="display-3" weight="bold" hasTabularNumbers>
              {props.value}
            </Text>
          </span>
          <Text type="supporting">건</Text>
        </HStack>
        <Text type="supporting" maxLines={1}>
          {props.note}
        </Text>
      </VStack>
    </Card>
  );
}

type Props = { stats: Stats; newCount: number; next: Posting | null };

/** The three counts above the list, as in the demo: open, closing soon (with the first to close) and new today. */
export function SummaryCards({ stats, newCount, next }: Props): React.ReactElement {
  return (
    <Grid columns={{ minWidth: 150, repeat: "fit" }} gap={3}>
      <Stat label="모집 중" value={stats.open} note="지금 지원할 수 있는 공고" />
      <Stat
        label="마감 임박"
        value={stats.closingSoon}
        note={next ? `가장 빠른 마감 · ${next.company}` : "3일 안에 마감되는 공고"}
        isUrgent
      />
      <Stat label="새로 올라옴" value={newCount} note="최근 3영업일 동안 올라온 공고" />
    </Grid>
  );
}
