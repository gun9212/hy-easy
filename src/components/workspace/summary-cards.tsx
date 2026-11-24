"use client";

import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { ApplicationStatus, Posting } from "@/lib/domain";
import { openCardNote } from "@/lib/posting-format";

export type Stats = {
  open: number;
  unknown: number;
  closingSoon: number;
  activeCompany: string | null;
  activeStatus: ApplicationStatus | null;
  hasActive: boolean;
};

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
      // ClickableCard passes extra props to its outer box, not the button, so the selected state and note go in the name.
      label={`${props.label} ${props.value}건 보기, ${props.note}${props.isSelected ? ", 선택됨" : ""}`}
      onClick={props.onSelect}
      padding={0}
      className="lift-card summary-stat-card"
      data-selected={props.isSelected ? "" : undefined}
    >
      <div className="summary-stat-body">
        <VStack gap={1.5}>
          <Text type="supporting" maxLines={1}>
            {props.label}
          </Text>
          <HStack gap={1} align="end">
            <span className="stat-value" data-urgent={props.isUrgent && props.value > 0 ? "" : undefined}>
              <Text type="display-3" weight="bold" hasTabularNumbers>
                {props.value}
              </Text>
            </span>
            <Text type="supporting">건</Text>
          </HStack>
          <span className="summary-stat-note">
            <Text type="supporting" maxLines={1}>
              {props.note}
            </Text>
          </span>
        </VStack>
      </div>
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
    <div className="summary-cards-grid">
      <Stat
        label="모집 중"
        value={stats.open}
        note={openCardNote(stats)}
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
    </div>
  );
}
