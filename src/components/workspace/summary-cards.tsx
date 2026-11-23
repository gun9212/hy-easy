"use client";

import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { Posting } from "@/lib/domain";

export type Stats = { open: number; closingSoon: number; activeCompany: string | null; hasActive: boolean };

type When = "open" | "soon" | "new";
type StatProps = {
  label: string;
  value: number;
  note: string;
  isUrgent?: boolean;
  isSelected: boolean;
  onSelect: () => void;
};

/** A count that opens its list, like the side navigation's 모집 중 / 마감 임박 / 새로 올라온 공고. */
function Stat(props: StatProps): React.ReactElement {
  return (
    <ClickableCard
      label={`${props.label} ${props.value}건 보기`}
      onClick={props.onSelect}
      padding={4}
      className="lift-card"
      data-selected={props.isSelected ? "" : undefined}
    >
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
    </ClickableCard>
  );
}

type Props = {
  stats: Stats;
  newCount: number;
  next: Posting | null;
  when: string | undefined;
  onSelect: (when: When) => void;
};

/** The three counts above the list, as in the demo: open, closing soon (with the first to close) and new today. */
export function SummaryCards({ stats, newCount, next, when, onSelect }: Props): React.ReactElement {
  return (
    <Grid columns={{ minWidth: 150, repeat: "fit" }} gap={3}>
      <Stat
        label="모집 중"
        value={stats.open}
        note="지금 지원할 수 있는 공고"
        isSelected={when === "open"}
        onSelect={() => onSelect("open")}
      />
      <Stat
        label="마감 임박"
        value={stats.closingSoon}
        note={next ? `가장 빠른 마감 · ${next.company}` : "3일 안에 마감되는 공고"}
        isUrgent
        isSelected={when === "soon"}
        onSelect={() => onSelect("soon")}
      />
      <Stat
        label="새로 올라옴"
        value={newCount}
        note="최근 3영업일 동안 올라온 공고"
        isSelected={when === "new"}
        onSelect={() => onSelect("new")}
      />
    </Grid>
  );
}
