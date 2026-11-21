"use client";

import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { eligibility, isNewPosting, type Posting } from "@/lib/domain";
import { deadlineShort } from "@/lib/posting-format";
import {
  BookmarkButton,
  CompareBox,
  DeadlineBadge,
  MajorFitBadge,
  Competition,
  StipendAmount,
  type RowProps,
} from "./posting-row-parts";

function PostingCard({ posting: p, props }: { posting: Posting; props: RowProps }): React.ReactElement {
  const closed = eligibility(p, props.applications, props.now).status === "closed";
  return (
    <ClickableCard label={`${p.title}, ${p.company}`} onClick={() => props.onOpen(p)} padding={4}>
      <VStack gap={2}>
        <HStack gap={1.5} align="center" justify="between">
          <HStack gap={1.5} align="center" wrap="wrap">
            <DeadlineBadge posting={p} applications={props.applications} now={props.now} />
            <Text type="supporting" hasTabularNumbers>
              {deadlineShort(p)} 마감
            </Text>
            {isNewPosting(p, props.now) && <span className="new-mark">신규</span>}
          </HStack>
          <HStack gap={1} align="center">
            <CompareBox posting={p} checked={props.compared.includes(p.id)} onCompare={props.onCompare} />
            <BookmarkButton posting={p} saved={props.favoriteIds.includes(p.id)} onFavorite={props.onFavorite} />
          </HStack>
        </HStack>
        <VStack gap={0.5}>
          <Text weight="bold" size="lg" color={closed ? "secondary" : "primary"}>
            {p.title}
          </Text>
          <HStack gap={1} align="center" wrap="wrap">
            <Text type="supporting">
              {p.company} · {p.classification?.primaryRole ?? "분류 대기"}
            </Text>
            <MajorFitBadge posting={p} major={props.major} />
          </HStack>
        </VStack>
        {p.classification?.summary && (
          <Text size="sm" color="secondary" maxLines={2}>
            {p.classification.summary}
          </Text>
        )}
        <Divider />
        <HStack gap={2} align="center" justify="between">
          <VStack gap={0.5}>
            <Text size="sm">{p.location || "미기재"}</Text>
            <Competition posting={p} align="start" />
          </VStack>
          <StipendAmount posting={p} />
        </HStack>
      </VStack>
    </ClickableCard>
  );
}

/** The phone layout: one tappable card per posting instead of a table that scrolls sideways. */
export function PostingCards(props: RowProps): React.ReactElement {
  return (
    <VStack gap={2}>
      {props.postings.map(p => (
        <PostingCard key={p.id} posting={p} props={props} />
      ))}
    </VStack>
  );
}
