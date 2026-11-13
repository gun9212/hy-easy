"use client";

import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { ListPosting as Posting } from "@demo/lib/list-posting";
import { stipendParts } from "./format";

/** "월 **250** 만원" with the amount large; the source text, dimmed, when the amount or unit is unknown. */
export function Stipend({ posting, justify = "end" }: { posting: Posting; justify?: "start" | "end" }) {
  const parts = stipendParts(posting);
  if (!parts)
    return (
      <Text type="supporting" maxLines={1}>
        {posting.stipend.raw || "미기재"}
      </Text>
    );
  return (
    <HStack gap={0.5} align="end" justify={justify}>
      <Text type="supporting">{parts.prefix}</Text>
      <Text weight="bold" size="lg" hasTabularNumbers>
        {parts.amount}
      </Text>
      <Text type="supporting">{parts.suffix}</Text>
    </HStack>
  );
}
