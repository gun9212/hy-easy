"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Grid } from "@astryxdesign/core/Grid";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { ListPosting as Posting } from "@demo/lib/list-posting";
import { PostingDetailSections } from "./posting-detail-sections";
import { competition, deadlineDetail, deadlineLabel, isClosed, isSoon, roleOf } from "./format";

type Props = { posting: Posting | null; now: string; onClose: () => void };

/** The classifier's summary, marked as AI-written so it is not mistaken for the posting's own words. */
function AiSummary({ text }: { text: string }): React.ReactElement {
  return (
    <Card variant="blue" padding={4}>
      <VStack gap={1}>
        <HStack gap={1.5} align="center">
          <Badge variant="info" label="AI 요약" />
          <Text type="supporting">원문을 바탕으로 자동 작성 · 아래 원문을 꼭 확인하세요</Text>
        </HStack>
        <Text as="p">{text}</Text>
      </VStack>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <VStack gap={0.5}>
      <Text type="supporting">{label}</Text>
      <Text weight="semibold">{value}</Text>
    </VStack>
  );
}

function Body({ posting, now }: { posting: Posting; now: string }): React.ReactElement {
  const role = roleOf(posting);
  return (
    <VStack gap={4}>
      <HStack gap={1} wrap="wrap">
        <Badge variant={isSoon(posting, now) ? "warning" : "neutral"} label={deadlineLabel(posting, now)} />
        {role && <Badge variant="blue" label={role} />}
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
      {posting.classification?.summary && <AiSummary text={posting.classification.summary} />}
      <Card variant="muted" padding={4}>
        <Grid columns={2} gap={3}>
          <Fact label="마감" value={deadlineDetail(posting)} />
          <Fact label="실습지원비" value={posting.stipend.raw} />
          <Fact label="지역" value={posting.location} />
          <Fact label="학기" value={posting.term} />
          <Fact label="기간" value={posting.period} />
          <Fact label="경쟁률" value={`${competition(posting)} (모집 ${posting.headcount ?? "-"}명)`} />
        </Grid>
      </Card>
      <Divider />
      <Text type="supporting" weight="semibold">
        HY-WEP 원문
      </Text>
      <PostingDetailSections id={posting.id} />
    </VStack>
  );
}

export function PostingDrawer({ posting, now, onClose }: Props): React.ReactElement {
  const onOpenChange = (open: boolean): void => {
    if (!open) onClose();
  };
  return (
    <Drawer isOpen={posting !== null} onOpenChange={onOpenChange} label="공고 상세" width={520} padding={0}>
      {posting && (
        <Layout
          header={
            <LayoutHeader hasDivider padding={4}>
              <DrawerHeader
                title={posting.title}
                subtitle={`${posting.company} · ${posting.department}`}
                onOpenChange={onOpenChange}
              />
            </LayoutHeader>
          }
          footer={
            <LayoutFooter hasDivider padding={4}>
              <HStack gap={2} justify="end">
                <Button variant="secondary" label="관심 공고에 담기" />
                <Button
                  variant="primary"
                  label={isClosed(posting, now) ? "마감된 공고" : "HY-WEP에서 지원"}
                  isDisabled={isClosed(posting, now)}
                  href={posting.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                />
              </HStack>
            </LayoutFooter>
          }
        >
          <LayoutContent padding={5}>
            <Body posting={posting} now={now} />
          </LayoutContent>
        </Layout>
      )}
    </Drawer>
  );
}
