"use client";

import { Card } from "@astryxdesign/core/Card";
import { PostingCards } from "./posting-cards";
import { PostingsTable, type Props } from "./postings-table";

/**
 * A table on wide screens and a card list on phones. Both render and CSS shows one (see .results-wide/.results-narrow
 * in globals.css), so the server and the first client render agree and nothing jumps on hydration.
 */
export function PostingResults(props: Props): React.ReactElement {
  return (
    <>
      <div className="results-wide">
        <Card padding={0}>
          <PostingsTable {...props} />
        </Card>
      </div>
      <div className="results-narrow">
        <PostingCards {...props} />
      </div>
    </>
  );
}
