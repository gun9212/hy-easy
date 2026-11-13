"use client";

import { Bookmark } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { eligibility, formatDate, type Application, type Decision, type Posting } from "@/lib/domain";
import type { Major } from "@/lib/majors";
import { Classification, Events, Facts, Majors, OriginalTexts } from "./posting-detail-sections";

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

const DECISION_STATUS: Record<Decision["status"], "success" | "warning" | "error" | "info"> = {
  available: "success",
  blocked: "warning",
  closed: "error",
  unknown: "info",
};

function Timestamps({ posting: p }: { posting: Posting }): React.ReactElement {
  return (
    <HStack gap={3} wrap="wrap">
      <Text type="supporting">최초 발견 {formatDate(p.firstSeenAt, true)}</Text>
      <Text type="supporting">최근 변경 {formatDate(p.updatedAt, true)}</Text>
      <Text type="supporting">최근 확인 {formatDate(p.lastCheckedAt, true)}</Text>
    </HStack>
  );
}

function Actions({
  posting: p,
  saved,
  onFavorite,
  onPlan,
}: Pick<Props, "posting" | "saved" | "onFavorite" | "onPlan">) {
  return (
    <HStack gap={2} justify="end" wrap="wrap">
      <Button
        variant="secondary"
        label={saved ? "관심 저장됨" : "관심 저장"}
        icon={<Bookmark size={16} fill={saved ? "currentColor" : "none"} />}
        onClick={onFavorite}
      />
      <Button variant="secondary" label="지원 일정 보기" onClick={onPlan} />
      <Button variant="primary" label="HY-WEP에서 확인" href={p.sourceUrl} target="_blank" rel="noreferrer" />
    </HStack>
  );
}

/** The posting's details in a side drawer: the decision first, then facts, AI summary, majors and HY-WEP's texts. */
export function PostingDetail({ posting: p, major, applications, now, saved, onFavorite, close, onPlan }: Props) {
  const decision = eligibility(p, applications, now);
  const onOpenChange = (open: boolean): void => {
    if (!open) close();
  };
  return (
    <Drawer isOpen onOpenChange={onOpenChange} label={`${p.company} 공고 상세`} width={560} padding={0}>
      <Layout
        header={
          <LayoutHeader hasDivider padding={4}>
            <DrawerHeader title={p.title} subtitle={`${p.company} · ${p.department}`} onOpenChange={onOpenChange} />
          </LayoutHeader>
        }
        footer={
          <LayoutFooter hasDivider padding={4}>
            <Actions posting={p} saved={saved} onFavorite={onFavorite} onPlan={onPlan} />
          </LayoutFooter>
        }
      >
        <LayoutContent padding={5}>
          <VStack gap={4}>
            <Banner
              status={DECISION_STATUS[decision.status]}
              title={decision.label}
              description={decision.reason}
              collapsible={false}
            />
            <Facts posting={p} />
            <Classification posting={p} />
            <Majors posting={p} major={major} />
            <Divider />
            <OriginalTexts posting={p} />
            <Events posting={p} />
            <Timestamps posting={p} />
          </VStack>
        </LayoutContent>
      </Layout>
    </Drawer>
  );
}
