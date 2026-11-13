"use client";

import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { Summary } from "./format";

type Variant = "accent" | "warning" | "success" | "neutral";
type Stat = { label: string; value: string; unit: string; note: string; variant: Variant };

function stats(summary: Summary): Stat[] {
  return [
    { label: "모집 중", value: String(summary.open), unit: "건", note: "지금 지원할 수 있는 공고", variant: "accent" },
    {
      label: "마감 임박",
      value: String(summary.soon),
      unit: "건",
      note: summary.next ? `가장 빠른 마감 · ${summary.next.company}` : "5일 안에 마감되는 공고",
      variant: "warning",
    },
    { label: "새로 올라옴", value: String(summary.fresh), unit: "건", note: "최근 24시간", variant: "success" },
  ];
}

export function SummaryStats({ summary }: { summary: Summary }): React.ReactElement {
  return (
    <Grid columns={{ minWidth: 150, repeat: "fit" }} gap={3}>
      {stats(summary).map(s => (
        <Card key={s.label} padding={4}>
          <VStack gap={1.5}>
            <HStack gap={1.5} align="center">
              <StatusDot variant={s.variant} label={s.label} />
              <Text type="supporting">{s.label}</Text>
            </HStack>
            <HStack gap={1} align="end">
              <Text type="display-3" weight="bold" hasTabularNumbers>
                {s.value}
              </Text>
              <Text type="supporting">{s.unit}</Text>
            </HStack>
            <Text type="supporting" maxLines={1}>
              {s.note}
            </Text>
          </VStack>
        </Card>
      ))}
    </Grid>
  );
}
