"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { ROLES, type Posting } from "@lib/domain";
import { daysLeft, isNew } from "./format";
import { PostingDrawer } from "./posting-drawer";
import { PostingsTable } from "./postings-table";

type View = "all" | "soon" | "new";
type Sort = "deadline" | "stipend" | "recent";
type Props = { postings: Posting[]; now: string };

const ALL_ROLES = "전체";
const VIEW_LABELS: Record<View, string> = { all: "전체 공고", soon: "마감 임박", new: "새로 올라온 공고" };

function inView(posting: Posting, view: View, now: string): boolean {
  if (view === "new") return isNew(posting, now);
  if (view === "soon") {
    const days = daysLeft(posting, now);
    return posting.recruitment === "open" && days !== null && days <= 5;
  }
  return true;
}

function matchesQuery(posting: Posting, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [posting.title, posting.company, posting.department, posting.tasks].some(s => s.toLowerCase().includes(q));
}

function compare(sort: Sort): (a: Posting, b: Posting) => number {
  if (sort === "stipend") return (a, b) => (b.stipend.amount ?? 0) - (a.stipend.amount ?? 0);
  if (sort === "recent") return (a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt);
  return (a, b) => (a.deadline.date ?? "9999").localeCompare(b.deadline.date ?? "9999");
}

function Brand(): React.ReactElement {
  return (
    <TopNavHeading
      // eslint-disable-next-line @next/next/no-img-element
      logo={<img src="/brand/hyu-symbol.svg" alt="" width={28} height={28} />}
      heading="HY-Easy"
      headingHref="/"
      headerEndContent={<Badge variant="blue" label="Astryx 데모" />}
    />
  );
}

export function PostingsApp({ postings, now }: Props): React.ReactElement {
  const [view, setView] = useState<View>("all");
  const [role, setRole] = useState<string>(ALL_ROLES);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("deadline");
  const [open, setOpen] = useState<Posting | null>(null);

  const counts = useMemo(
    () => ({
      all: postings.length,
      soon: postings.filter(p => inView(p, "soon", now)).length,
      new: postings.filter(p => inView(p, "new", now)).length,
    }),
    [postings, now],
  );
  const visible = useMemo(
    () =>
      postings
        .filter(p => inView(p, view, now))
        .filter(p => role === ALL_ROLES || p.classification?.primaryRole === role)
        .filter(p => matchesQuery(p, query))
        .toSorted(compare(sort)),
    [postings, view, role, query, sort, now],
  );

  const sideNav = (
    <SideNav>
      <SideNavSection title="공고 보기">
        {(Object.keys(VIEW_LABELS) as View[]).map(v => (
          <SideNavItem
            key={v}
            label={VIEW_LABELS[v]}
            isSelected={view === v}
            onClick={() => setView(v)}
            endContent={<Text type="supporting">{counts[v]}</Text>}
          />
        ))}
      </SideNavSection>
      <SideNavSection title="내 활동">
        <SideNavItem label="관심 공고" onClick={() => undefined} />
        <SideNavItem label="지원 현황" onClick={() => undefined} />
      </SideNavSection>
    </SideNav>
  );

  return (
    <AppShell
      topNav={<TopNav label="HY-Easy" heading={<Brand />} endContent={<Text type="supporting">둘러보는 한양인</Text>} />}
      sideNav={sideNav}
      contentPadding={6}
    >
      <VStack gap={5} maxWidth={1240}>
        <VStack gap={1}>
          <Heading level={1}>{VIEW_LABELS[view]}</Heading>
          <Text type="supporting">한양대학교 HY-WEP 현장실습 공고를 마감 순으로 비교합니다. (가상 데이터)</Text>
        </VStack>
        <HStack gap={3} align="end" wrap="wrap">
          <TextInput
            type="search"
            label="검색"
            placeholder="회사, 공고명, 업무"
            value={query}
            onChange={setQuery}
            hasClear
            width={280}
          />
          <Selector
            label="직무"
            options={[ALL_ROLES, ...ROLES]}
            value={role}
            onChange={v => setRole(v ?? ALL_ROLES)}
            width={180}
          />
          <SegmentedControl label="정렬" value={sort} onChange={v => setSort(v as Sort)}>
            <SegmentedControlItem value="deadline" label="마감순" />
            <SegmentedControlItem value="stipend" label="지원비순" />
            <SegmentedControlItem value="recent" label="최신순" />
          </SegmentedControl>
        </HStack>
        <Text type="supporting">{visible.length}개 공고</Text>
        {visible.length > 0 ? (
          <PostingsTable postings={visible} now={now} onOpen={setOpen} />
        ) : (
          <EmptyState title="조건에 맞는 공고가 없어요" description="검색어나 직무 필터를 바꿔 보세요." />
        )}
      </VStack>
      <PostingDrawer posting={open} now={now} onClose={() => setOpen(null)} />
    </AppShell>
  );
}
