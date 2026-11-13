"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { ListPosting as Posting } from "@demo/lib/list-posting";
import { competition, deadlineLabel, deadlineShort, isClosed, isNew, isSoon, roleOf } from "./format";
import type { Props } from "./postings-table";
import { Stipend } from "./stipend";

function PostingCard({ posting, now, onOpen }: { posting: Posting; now: string; onOpen: Props["onOpen"] }) {
  const closed = isClosed(posting, now);
  const label = deadlineLabel(posting, now);
  return (
    <ClickableCard label={`${posting.title}, ${posting.company}`} onClick={() => onOpen(posting)} padding={4}>
      <VStack gap={2}>
        <HStack gap={1.5} align="center" justify="between">
          <HStack gap={1.5} align="center">
            <Badge variant={isSoon(posting, now) ? "warning" : "neutral"} label={label} />
            <Text type="supporting" hasTabularNumbers>
              {deadlineShort(posting)} 마감
            </Text>
          </HStack>
          {isNew(posting, now) && <Badge variant="info" label="신규" />}
        </HStack>
        <VStack gap={0.5}>
          <Text weight="bold" size="lg" color={closed ? "secondary" : "primary"}>
            {posting.title}
          </Text>
          <Text type="supporting">
            {posting.company} · {roleOf(posting) ?? "미분류"}
          </Text>
        </VStack>
        {posting.classification?.summary && (
          <Text size="sm" color="secondary" maxLines={2}>
            {posting.classification.summary}
          </Text>
        )}
        <Divider />
        <HStack gap={2} align="center" justify="between">
          <VStack gap={0.5}>
            <Text size="sm">{posting.location}</Text>
            <Text type="supporting" hasTabularNumbers>
              경쟁률 {competition(posting)}
            </Text>
          </VStack>
          <Stipend posting={posting} />
        </HStack>
      </VStack>
    </ClickableCard>
  );
}

/** The phone layout: one tappable card per posting instead of a table that scrolls sideways. */
export function PostingCards({ postings, now, onOpen }: Props): React.ReactElement {
  return (
    <VStack gap={2}>
      {postings.map(p => (
        <PostingCard key={p.id} posting={p} now={now} onOpen={onOpen} />
      ))}
    </VStack>
  );
}
