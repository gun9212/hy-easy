"use client";

import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { ListPosting as Posting } from "@demo/lib/list-posting";
import { DEADLINE_GROUPS, deadlineGroup, type DeadlineGroup } from "./format";
import { PostingResults } from "./posting-results";
import type { Props } from "./postings-table";

const HINTS: Record<DeadlineGroup, string> = {
  "3일 안에 마감": "오늘 서류를 마무리해야 하는 공고",
  "이번 주 마감": "이번 주 안에 지원을 끝낼 공고",
  "다음 주 이후": "여유 있게 준비할 수 있는 공고",
  "마감일 미정": "원문에 마감일이 없는 공고",
  "마감된 공고": "지원 기간이 끝난 공고",
};

function GroupTitle({ group, count }: { group: DeadlineGroup; count: number }): React.ReactElement {
  return (
    <HStack gap={2} align="center" wrap="wrap">
      <Text weight="bold" size="lg">
        {group}
      </Text>
      <Badge variant={group === "3일 안에 마감" ? "warning" : "neutral"} label={`${count}건`} />
      <Text type="supporting">{HINTS[group]}</Text>
    </HStack>
  );
}

function groupPostings(postings: Posting[], now: string): [DeadlineGroup, Posting[]][] {
  return DEADLINE_GROUPS.map(
    g => [g, postings.filter(p => deadlineGroup(p, now) === g)] as [DeadlineGroup, Posting[]],
  ).filter(([, items]) => items.length > 0);
}

/** One titled, collapsible card per deadline group, with space between them. Closed postings start collapsed. */
export function DeadlineGroups({ postings, now, onOpen }: Props): React.ReactElement {
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<DeadlineGroup>>(() => new Set(["마감된 공고"]));
  const setOpen = (group: DeadlineGroup, isOpen: boolean): void =>
    setClosedGroups(prev => new Set([...prev].filter(g => g !== group).concat(isOpen ? [] : [group])));

  return (
    <VStack gap={6}>
      {groupPostings(postings, now).map(([group, items]) => (
        <Collapsible
          key={group}
          chevronPosition="start"
          isOpen={!closedGroups.has(group)}
          onOpenChange={isOpen => setOpen(group, isOpen)}
          trigger={<GroupTitle group={group} count={items.length} />}
        >
          <VStack paddingBlockStart={2}>
            {!closedGroups.has(group) && <PostingResults postings={items} now={now} onOpen={onOpen} />}
          </VStack>
        </Collapsible>
      ))}
    </VStack>
  );
}
