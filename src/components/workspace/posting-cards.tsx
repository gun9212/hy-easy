"use client";

import { memo } from "react";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { eligibility, isNewPosting, type Application, type Posting } from "@/lib/domain";
import type { Major } from "@/lib/majors";
import { deadlineShort, postedShort } from "@/lib/posting-format";
import {
  BookmarkButton,
  CompareBox,
  DeadlineBadge,
  MajorFitBadge,
  Competition,
  StipendAmount,
  type RowProps,
} from "./posting-row-parts";

type CardItemProps = {
  posting: Posting;
  applications: Application[];
  now: Date;
  major: Major | null;
  checked: boolean;
  saved: boolean;
  hideBookmark?: boolean;
  onCompare: RowProps["onCompare"];
  onOpen: RowProps["onOpen"];
  onFavorite: RowProps["onFavorite"];
};

const PostingCard = memo(function PostingCard({
  posting: p,
  applications,
  now,
  major,
  checked,
  saved,
  hideBookmark,
  onCompare,
  onOpen,
  onFavorite,
}: CardItemProps): React.ReactElement {
  const closed = eligibility(p, applications, now).status === "closed";
  return (
    <ClickableCard label={`${p.title}, ${p.company}`} onClick={() => onOpen(p)} padding={4} className="lift-card">
      <VStack gap={2}>
        <HStack gap={1.5} align="center" justify="between">
          <HStack gap={1.5} align="center" wrap="wrap">
            <DeadlineBadge posting={p} applications={applications} now={now} />
            <Text type="supporting" hasTabularNumbers>
              {deadlineShort(p)} 마감
            </Text>
            {postedShort(p) && (
              <Text type="supporting" size="sm" hasTabularNumbers>
                · {postedShort(p)} 등록
              </Text>
            )}
            {isNewPosting(p, now) && <span className="new-mark">신규</span>}
          </HStack>
          <HStack gap={1} align="center">
            <CompareBox posting={p} checked={checked} onCompare={onCompare} />
            {!hideBookmark && <BookmarkButton posting={p} saved={saved} onFavorite={onFavorite} />}
          </HStack>
        </HStack>
        <VStack gap={0.5}>
          <Text weight="bold" size="lg" color={closed ? "secondary" : "primary"}>
            {p.title}
          </Text>
          <HStack gap={1} align="center" wrap="wrap">
            <Text type="supporting">
              <span className="company-name" data-closed={closed ? "" : undefined}>
                {p.company}
              </span>{" "}
              · {p.classification?.primaryRole ?? "분류 대기"}
            </Text>
            <MajorFitBadge posting={p} major={major} />
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
});

/** The phone layout: one tappable card per posting instead of a table that scrolls sideways. */
export function PostingCards(props: RowProps): React.ReactElement {
  return (
    <VStack gap={2}>
      {props.postings.map(p => (
        <PostingCard
          key={p.id}
          posting={p}
          applications={props.applications}
          now={props.now}
          major={props.major}
          checked={props.compared.includes(p.id)}
          saved={props.favoriteIds.includes(p.id)}
          hideBookmark={props.hideBookmark}
          onCompare={props.onCompare}
          onOpen={props.onOpen}
          onFavorite={props.onFavorite}
        />
      ))}
    </VStack>
  );
}
