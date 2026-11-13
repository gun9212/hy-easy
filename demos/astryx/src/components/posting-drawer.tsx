"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { Posting } from "@lib/domain";
import { competition, deadlineDetail, deadlineLabel, isClosed, isSoon, roleOf } from "./format";

type Props = { posting: Posting | null; now: string; onClose: () => void };

function Fact({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <VStack gap={0.5}>
      <Text type="supporting">{label}</Text>
      <Text weight="semibold">{value}</Text>
    </VStack>
  );
}

function Section({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <VStack gap={1}>
      <Heading level={3}>{title}</Heading>
      <Text as="p">{body}</Text>
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
      <Section title="실습 내용" body={posting.practiceInfo} />
      <Section title="수행 업무" body={posting.tasks} />
      <Section title="자격 요건" body={posting.qualifications} />
      <Section title="혜택" body={posting.benefits} />
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
