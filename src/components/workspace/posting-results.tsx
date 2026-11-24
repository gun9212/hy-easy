"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { PostingCards } from "./posting-cards";
import type { RowProps } from "./posting-row-parts";
import { PostingsTable } from "./postings-table";

const FIRST_PAGE = 20;
const MORE_STEP = 50;

/**
 * The first 20 postings and a button for more, as a table where the list is wide enough for every column and as
 * cards where it is not. Both are rendered and CSS picks one by the list's own width (.posting-results in
 * astryx-overrides.css): the side menu and the preview frame make the viewport width a poor guide, and the server
 * HTML is already right before hydration.
 */
export function PostingResults(props: RowProps): React.ReactElement {
  const [limit, setLimit] = useState(FIRST_PAGE);
  const shown = { ...props, postings: props.postings.slice(0, limit) };
  const rest = props.postings.length - shown.postings.length;
  return (
    <VStack gap={2}>
      <div className="posting-results">
        <div className="posting-results-cards">
          <PostingCards {...shown} />
        </div>
        <div className="posting-results-table">
          <Card padding={0}>
            <PostingsTable {...shown} />
          </Card>
        </div>
      </div>
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
