"use client";

import { Bookmark } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Divider } from "@astryxdesign/core/Divider";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { eligibility, formatDate, type Application, type Decision, type Posting } from "@/lib/domain";
import type { Major } from "@/lib/majors";
import { Classification, Events, Facts, Majors, OriginalTexts } from "./posting-detail-sections";
import { DeadlineBadge } from "./posting-row-parts";
import { DetailFrame } from "./detail-frame";

type Props = {
  posting: Posting;
  major: Major | null;
  applications: Application[];
  now: Date;
  saved: boolean;
  onFavorite: () => void;
  close: () => void;
  onPlan: () => void;
};

const DECISION_BADGE: Record<Decision["status"], "success" | "warning" | "neutral"> = {
  available: "success",
  blocked: "warning",
  closed: "neutral",
  unknown: "neutral",
};

/** The demo's badge row: deadline, role, programme type, plus whether the schedule allows applying. */
function BadgeRow({ posting: p, decision, props }: { posting: Posting; decision: Decision; props: Props }) {
  return (
    <HStack gap={1} wrap="wrap" align="center">
      <DeadlineBadge posting={p} applications={props.applications} now={props.now} />
      {p.classification && <Badge variant="blue" label={p.classification.primaryRole} />}
      {p.programType && <Badge variant="neutral" label={p.programType} />}
      <Badge variant={DECISION_BADGE[decision.status]} label={decision.label} />
    </HStack>
  );
}

/** What the demo left out, kept one click away: why the decision, the majors in full, timestamps, the planner. */
function MoreDetails({ posting: p, decision, props }: { posting: Posting; decision: Decision; props: Props }) {
  return (
    <Collapsible chevronPosition="start" defaultIsOpen={false} trigger={<Text type="supporting">자세히 보기</Text>}>
      <VStack gap={3} paddingBlockStart={2}>
        <VStack gap={0.5}>
          <Text weight="semibold">{decision.label}</Text>
          <Text type="supporting">{decision.reason}</Text>
        </VStack>
        <Majors posting={p} major={props.major} />
        <HStack gap={3} wrap="wrap">
          <Text type="supporting">최초 발견 {formatDate(p.firstSeenAt, true)}</Text>
          <Text type="supporting">최근 변경 {formatDate(p.updatedAt, true)}</Text>
          <Text type="supporting">최근 확인 {formatDate(p.lastCheckedAt, true)}</Text>
        </HStack>
        <HStack>
          <Button variant="secondary" size="sm" label="지원 일정 보기" onClick={props.onPlan} />
        </HStack>
      </VStack>
    </Collapsible>
  );
}

/** The posting in a centered dialog (a drawer on a phone), laid out as in the demo: badges, AI summary, facts, then HY-WEP's own texts. */
export function PostingDetail(props: Props) {
  const { posting: p, saved, onFavorite, close } = props;
  const decision = eligibility(p, props.applications, props.now);
  const closed = decision.status === "closed";
  return (
    <DetailFrame
      label={`${p.company} 공고 상세`}
      title={p.title}
      subtitle={`${p.company} · ${p.department}`}
      close={close}
      render={header => (
        <Layout
          header={
            <LayoutHeader hasDivider padding={4}>
              {header}
            </LayoutHeader>
          }
          footer={
            <LayoutFooter hasDivider padding={4}>
              <HStack gap={2} justify="end">
                <Button
                  variant="secondary"
                  label={saved ? "저장됨" : "관심 저장"}
                  icon={<Bookmark size={16} fill={saved ? "currentColor" : "none"} />}
                  onClick={onFavorite}
                />
                <Button
                  variant="primary"
                  label={closed ? "마감됨" : "HY-WEP 지원"}
                  isDisabled={closed}
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                />
              </HStack>
            </LayoutFooter>
          }
        >
          <LayoutContent padding={5}>
            <VStack gap={4}>
              <BadgeRow posting={p} decision={decision} props={props} />
              {(p.classification?.needsReview || p.classificationStale) && (
                <Banner
                  status="warning"
                  title="직무 분류 확인 필요"
                  description="원문과 분류가 다를 수 있어 관리자가 검토 중입니다."
                  collapsible={false}
                />
              )}
              <Classification posting={p} />
              <Facts posting={p} />
              <MoreDetails posting={p} decision={decision} props={props} />
              <Divider />
              <OriginalTexts posting={p} />
              <Events posting={p} />
            </VStack>
          </LayoutContent>
        </Layout>
      )}
    />
  );
}
