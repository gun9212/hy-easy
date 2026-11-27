"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { useIsNarrow } from "./layout-context";
import { PostingCards } from "./posting-cards";
import type { RowProps } from "./posting-row-parts";

// Split out @astryxdesign/core/Table (~220 KB Brotli) so phone requests (where narrow is true on SSR) never ship or
// parse the desktop table bundle on /login, while desktop SSR still renders it inline.
const PostingsTable = dynamic(() => import("./postings-table").then(mod => mod.PostingsTable));

const FIRST_PAGE = 20;
const MORE_STEP = 50;
const TABLE_MIN_INLINE_PX = 1024;

/**
 * The first 20 postings and a button for more, as a table where the list is wide enough for every column and as
 * cards where it is not. On non-phone SSR both are rendered so CSS container queries (.posting-results in
 * astryx-overrides.css) pick the right layout before hydration; once mounted, ResizeObserver unmounts the hidden
 * branch so sorts, filters and checkbox clicks never reconcile twice as many DOM nodes.
 */
export function PostingResults(props: RowProps & { resetKey?: string }): React.ReactElement {
  const { resetKey, ...rowProps } = props;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  const [limit, setLimit] = useState(FIRST_PAGE);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    if (limit !== FIRST_PAGE) setLimit(FIRST_PAGE);
  }
  const narrow = useIsNarrow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [wideContainer, setWideContainer] = useState<boolean | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setWideContainer(width >= TABLE_MIN_INLINE_PX);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Phone viewports (<768px) can never hold a >=1024px list container, so skip the table on both SSR and client.
  const showCards = narrow || wideContainer !== true;
  const showTable = !narrow && wideContainer !== false;

  const shown = { ...rowProps, postings: rowProps.postings.slice(0, limit) };
  const rest = rowProps.postings.length - shown.postings.length;
  return (
    <VStack gap={2}>
      <div ref={containerRef} className="posting-results">
        {showCards && (
          <div className="posting-results-cards">
            <PostingCards {...shown} />
          </div>
        )}
        {showTable && (
          <div className="posting-results-table">
            <Card padding={0}>
              <PostingsTable {...shown} />
            </Card>
          </div>
        )}
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
