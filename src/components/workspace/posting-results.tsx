"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { useIsNarrow } from "./layout-context";
import { PostingCards } from "./posting-cards";
import type { RowProps } from "./posting-row-parts";
import { PostingsTable } from "./postings-table";

const FIRST_PAGE = 20;
const MORE_STEP = 50;

/** A table on wide screens or a card list on phones (never both), the first 20 postings and a button for more. */
export function PostingResults(props: RowProps): React.ReactElement {
  const isNarrow = useIsNarrow();
  const [limit, setLimit] = useState(FIRST_PAGE);
  const shown = { ...props, postings: props.postings.slice(0, limit) };
  const rest = props.postings.length - shown.postings.length;
  return (
    <VStack gap={2}>
      {isNarrow ? (
        <PostingCards {...shown} />
      ) : (
        <Card padding={0}>
          <PostingsTable {...shown} />
        </Card>
      )}
      {rest > 0 && (
        <HStack justify="center">
          <Button
            variant="secondary"
            label={`${Math.min(rest, MORE_STEP)}개 더 보기 (남은 ${rest}개)`}
            onClick={() => setLimit(n => n + MORE_STEP)}
          />
        </HStack>
      )}
    </VStack>
  );
}
