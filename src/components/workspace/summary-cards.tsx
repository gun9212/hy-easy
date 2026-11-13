"use client";

import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import type { Posting } from "@/lib/domain";

export type Stats = { open: number; closingSoon: number; activeCompany: string | null; hasActive: boolean };
type Variant = "accent" | "warning" | "success";

function Stat(props: { label: string; value: number; note: string; variant: Variant }): React.ReactElement {
  return (
    <Card padding={4}>
      <VStack gap={1.5}>
        <HStack gap={1.5} align="center">
          <StatusDot variant={props.variant} label={props.label} />
          <Text type="supporting">{props.label}</Text>
        </HStack>
        <HStack gap={1} align="end">
          <Text type="display-3" weight="bold" hasTabularNumbers>
            {props.value}
          </Text>
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
      <Stat label="모집 중" value={stats.open} note="지금 지원할 수 있는 공고" variant="accent" />
      <Stat
        label="마감 임박"
        value={stats.closingSoon}
        note={next ? `가장 빠른 마감 · ${next.company}` : "3일 안에 마감되는 공고"}
        variant="warning"
      />
      <Stat label="새로 올라옴" value={newCount} note="오늘 새로 수집된 공고" variant="success" />
    </Grid>
  );
}
