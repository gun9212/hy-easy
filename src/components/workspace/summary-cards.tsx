"use client";

import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";

export type Stats = { open: number; closingSoon: number; activeCompany: string | null; hasActive: boolean };
type Variant = "accent" | "warning" | "neutral";

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
          <Text type="supporting">개</Text>
        </HStack>
        <Text type="supporting" maxLines={1}>
          {props.note}
        </Text>
      </VStack>
    </Card>
  );
}

/** The counts above the list, and the way into the planner. */
export function SummaryCards(props: { stats: Stats; favorites: number; onPlanner: () => void }): React.ReactElement {
  const { stats } = props;
  return (
    <Grid columns={{ minWidth: 150, repeat: "fit" }} gap={3}>
      <Stat label="모집 중인 공고" value={stats.open} note="지금 지원할 수 있는 공고" variant="accent" />
      <Stat label="3일 이내 마감" value={stats.closingSoon} note="서류를 서둘러야 하는 공고" variant="warning" />
      <Stat label="관심 공고" value={props.favorites} note="북마크로 모아 둔 공고" variant="neutral" />
      <ClickableCard label="지원 플래너 열기" onClick={props.onPlanner} padding={4} variant="blue">
        <VStack gap={1}>
          <Text weight="bold">
            {stats.activeCompany ? `${stats.activeCompany} 지원 진행 중` : "지원을 시작하기 전, 일정부터"}
          </Text>
          <Text type="supporting">
            {stats.hasActive
              ? "시스템 탈락 처리 완료 후 다음 지원이 가능해요."
              : "한 번에 한 기업, 다음 지원 일정까지 살펴보세요."}
          </Text>
          <Text size="sm" color="accent" weight="semibold">
            지원 플래너 →
          </Text>
        </VStack>
      </ClickableCard>
    </Grid>
  );
}
