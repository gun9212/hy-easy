"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Heading } from "@astryxdesign/core/Heading";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { Posting } from "@lib/domain";
import { deadlineDetail, deadlineLabel, roleColor } from "./format";

type Props = { posting: Posting | null; now: string; onClose: () => void };

function Section({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <VStack gap={1}>
      <Heading level={3}>{title}</Heading>
      <Text as="p">{body}</Text>
    </VStack>
  );
}

export function PostingDrawer({ posting, now, onClose }: Props): React.ReactElement {
  const onOpenChange = (open: boolean): void => {
    if (!open) onClose();
  };
  const role = posting?.classification?.primaryRole;
  return (
    <Drawer isOpen={posting !== null} onOpenChange={onOpenChange} label="공고 상세" width={480}>
      {posting && (
        <VStack gap={4}>
          <DrawerHeader
            title={posting.title}
            subtitle={`${posting.company} · ${posting.department}`}
            onOpenChange={onOpenChange}
          />
          <HStack gap={1} wrap="wrap">
            {role && <Badge variant={roleColor(role)} label={role} />}
            <Badge variant="neutral" label={deadlineLabel(posting, now)} />
            <Badge variant="neutral" label={posting.programType} />
          </HStack>
          {posting.classification?.needsReview && (
            <Banner
              status="warning"
              title="직무 분류 확인 필요"
              description="원문과 분류가 다를 수 있어 관리자가 검토 중입니다."
              collapsible={false}
            />
          )}
          <MetadataList columns="multi">
            <MetadataListItem label="마감">{deadlineDetail(posting)}</MetadataListItem>
            <MetadataListItem label="실습지원비">{posting.stipend.raw}</MetadataListItem>
            <MetadataListItem label="지역">{posting.location}</MetadataListItem>
            <MetadataListItem label="기간">{posting.period}</MetadataListItem>
            <MetadataListItem label="학기">{posting.term}</MetadataListItem>
            <MetadataListItem label="지원/모집">
              {posting.applicants ?? "-"} / {posting.headcount ?? "-"}명
            </MetadataListItem>
          </MetadataList>
          <Divider />
          <Section title="실습 내용" body={posting.practiceInfo} />
          <Section title="수행 업무" body={posting.tasks} />
          <Section title="자격 요건" body={posting.qualifications} />
          <Section title="혜택" body={posting.benefits} />
          <HStack gap={2}>
            <Button variant="primary" label="HY-WEP에서 지원" href={posting.sourceUrl} target="_blank" rel="noreferrer" />
            <Button variant="secondary" label="관심 공고에 담기" />
          </HStack>
        </VStack>
      )}
    </Drawer>
  );
}
