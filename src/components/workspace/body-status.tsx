"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

/** Shown in place of the source texts while the full posting loads (the synced list leaves them out), or if that failed. */
export function BodyStatus({ status, retry }: { status: "loading" | "error"; retry: () => void }): React.ReactElement {
  return status === "loading" ? (
    <Text type="supporting" role="status">
      원문을 불러오는 중…
    </Text>
  ) : (
    <HStack gap={2} align="center" wrap="wrap" role="alert">
      <Text type="supporting">원문을 불러오지 못했어요.</Text>
      <Button variant="secondary" size="sm" label="다시 시도" onClick={retry} />
    </HStack>
  );
}
