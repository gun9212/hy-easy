"use client";

import { useState } from "react";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { DEADLINE_GROUP_HINTS, groupByDeadline, type DeadlineGroup } from "@/lib/deadline-groups";
import { PostingResults } from "./posting-results";
import type { RowProps } from "./posting-row-parts";

function GroupTitle({ group, count }: { group: DeadlineGroup; count: number }): React.ReactElement {
  return (
    <HStack gap={2} align="center" wrap="wrap">
      <Text weight="semibold" size="lg">
        {group}
      </Text>
      <span className="group-count">{count}개</span>
      <Text type="supporting">{DEADLINE_GROUP_HINTS[group]}</Text>
    </HStack>
  );
}

/** One titled, foldable section per deadline group; closed postings start folded and are not rendered until opened. */
export function DeadlineGroups(props: RowProps): React.ReactElement {
  const [folded, setFolded] = useState<ReadonlySet<DeadlineGroup>>(() => new Set(["마감된 공고"]));
  const setOpen = (group: DeadlineGroup, isOpen: boolean): void =>
    setFolded(prev => new Set([...prev].filter(g => g !== group).concat(isOpen ? [] : [group])));
  return (
    <VStack gap={6}>
      {groupByDeadline(props.postings, props.now).map(([group, items]) => (
        <Collapsible
          key={group}
          chevronPosition="start"
          isOpen={!folded.has(group)}
          onOpenChange={isOpen => setOpen(group, isOpen)}
          trigger={<GroupTitle group={group} count={items.length} />}
        >
          <VStack paddingBlockStart={2}>{!folded.has(group) && <PostingResults {...props} postings={items} />}</VStack>
        </Collapsible>
      ))}
    </VStack>
  );
}
