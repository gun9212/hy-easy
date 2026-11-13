"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { useIsNarrow } from "./layout-context";
import { PostingCards } from "./posting-cards";
import { PostingsTable, type Props } from "./postings-table";

const FIRST_PAGE = 20;
const MORE_STEP = 50;

/**
 * A table on wide screens or a card list on phones, never both, showing the first 20 postings with a button for
 * more. Rendering every one of 300 postings twice made the first page over 3MB.
 */
export function PostingResults({ postings, now, onOpen }: Props): React.ReactElement {
  const isNarrow = useIsNarrow();
  const [limit, setLimit] = useState(FIRST_PAGE);
  const shown = postings.slice(0, limit);
  const rest = postings.length - shown.length;
  return (
    <VStack gap={2}>
      {isNarrow ? (
        <PostingCards postings={shown} now={now} onOpen={onOpen} />
      ) : (
        <Card padding={0}>
          <PostingsTable postings={shown} now={now} onOpen={onOpen} />
        </Card>
      )}
      {rest > 0 && (
        <HStack justify="center">
          <Button
            variant="secondary"
            label={`${Math.min(rest, MORE_STEP)}건 더 보기 (남은 ${rest}건)`}
            onClick={() => setLimit(n => n + MORE_STEP)}
          />
        </HStack>
      )}
    </VStack>
  );
}
