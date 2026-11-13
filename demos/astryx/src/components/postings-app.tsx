"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { ROLES, type Posting, type Role } from "@lib/domain";
import { AppSideNav, VIEW_LABELS, type View } from "./app-side-nav";
import type { SourceReason } from "@demo/lib/postings-source";
import { isClosed, isNew, isSoon, lastSyncLabel, roleOf, summarize } from "./format";
import { SourceBanner } from "./source-banner";
import { DeadlineGroups } from "./deadline-groups";
import { PostingDrawer } from "./posting-drawer";
import { PostingResults } from "./posting-results";
import { SummaryStats } from "./summary-stats";

type Sort = "deadline" | "stipend" | "recent";
type Props = { postings: Posting[]; now: string; reason: SourceReason; mainAppLogin: string };

const ALL_ROLES = "전체 직무";

function inView(p: Posting, view: View, now: string): boolean {
  if (view === "new") return isNew(p, now);
  if (view === "soon") return isSoon(p, now);
  return true;
}

function matchesQuery(p: Posting, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || [p.title, p.company, p.department, p.tasks].some(s => s.toLowerCase().includes(q));
}

/** Closed postings always sink to the bottom; the chosen order applies within open and closed. */
function compare(sort: Sort, now: string): (a: Posting, b: Posting) => number {
  const byKey: Record<Sort, (a: Posting, b: Posting) => number> = {
    deadline: (a, b) => (a.deadline.date ?? "9999").localeCompare(b.deadline.date ?? "9999"),
    stipend: (a, b) => (b.stipend.amount ?? 0) - (a.stipend.amount ?? 0),
    recent: (a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt),
  };
  return (a, b) => Number(isClosed(a, now)) - Number(isClosed(b, now)) || byKey[sort](a, b);
}

function countRoles(postings: Posting[]): Map<Role, number> {
  return postings.reduce((m, p) => {
    const r = roleOf(p);
    return r ? new Map(m).set(r, (m.get(r) ?? 0) + 1) : m;
  }, new Map<Role, number>());
}

function TopBar(): React.ReactElement {
  return (
    <TopNav
      label="HY-Easy"
      heading={
        <TopNavHeading
          // eslint-disable-next-line @next/next/no-img-element
          logo={<img src="/brand/hyu-symbol.svg" alt="" width={28} height={28} />}
          heading="HY-Easy"
          headingHref="/"
          headerEndContent={<Badge variant="blue" label="Astryx 데모" />}
        />
      }
      endContent={<Avatar name="둘러보는 한양인" size="sm" />}
    />
  );
}

export function PostingsApp({ postings, now, reason, mainAppLogin }: Props): React.ReactElement {
  const [view, setView] = useState<View>("all");
  const [role, setRole] = useState<Role | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("deadline");
  const [open, setOpen] = useState<Posting | null>(null);

  const summary = useMemo(() => summarize(postings, now), [postings, now]);
  const viewCounts: Record<View, number> = {
    all: postings.length,
    soon: summary.soon,
    new: summary.fresh,
  };
  const roleCounts = useMemo(() => countRoles(postings), [postings]);
  const visible = useMemo(
    () =>
      postings
        .filter(p => inView(p, view, now) && (role === null || roleOf(p) === role) && matchesQuery(p, query))
        .toSorted(compare(sort, now)),
    [postings, view, role, query, sort, now],
  );
  const title = role ?? VIEW_LABELS[view];
  const sideNav = (
    <AppSideNav
      view={view}
      role={role}
      viewCounts={viewCounts}
      roleCounts={roleCounts}
      next={summary.next}
      now={now}
      onView={setView}
      onRole={setRole}
      onOpen={setOpen}
    />
  );

  return (
    <AppShell topNav={<TopBar />} sideNav={sideNav} contentPadding={5}>
      <VStack gap={4}>
        <HStack gap={3} align="end" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={1}>{title}</Heading>
            <Text type="supporting">
              한양대학교 HY-WEP 현장실습 공고 · {lastSyncLabel(postings) ?? "-"} 확인
              {reason === "live" ? "" : " (가상 데이터)"}
            </Text>
          </VStack>
          <Button variant="primary" label="HY-WEP 바로가기" href="https://hywep.hanyang.ac.kr/" target="_blank" />
        </HStack>
        <SourceBanner reason={reason} mainAppLogin={mainAppLogin} />
        <SummaryStats summary={summary} />
        <Card padding={3}>
          <HStack gap={2} align="center" wrap="wrap">
            <TextInput
              type="search"
              label="검색"
              isLabelHidden
              placeholder="회사, 공고명, 업무로 검색"
              value={query}
              onChange={setQuery}
              hasClear
              width={300}
            />
            <Selector
              label="직무"
              isLabelHidden
              options={[ALL_ROLES, ...ROLES]}
              value={role ?? ALL_ROLES}
              onChange={v => setRole(!v || v === ALL_ROLES ? null : (v as Role))}
              width={160}
            />
            <SegmentedControl label="정렬" value={sort} onChange={v => setSort(v as Sort)}>
              <SegmentedControlItem value="deadline" label="마감순" />
              <SegmentedControlItem value="stipend" label="지원비순" />
              <SegmentedControlItem value="recent" label="최신순" />
            </SegmentedControl>
            <Text type="supporting">
              <b>{visible.length}</b>개 공고
            </Text>
          </HStack>
        </Card>
        {visible.length === 0 ? (
          <EmptyState title="조건에 맞는 공고가 없어요" description="검색어나 직무 필터를 바꿔 보세요." />
        ) : sort === "deadline" ? (
          <DeadlineGroups postings={visible} now={now} onOpen={setOpen} />
        ) : (
          <PostingResults postings={visible} now={now} onOpen={setOpen} />
        )}
      </VStack>
      <PostingDrawer posting={open} now={now} onClose={() => setOpen(null)} />
    </AppShell>
  );
}
