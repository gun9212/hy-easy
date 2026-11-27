"use client";

// Page chrome on Astryx: the top bar and the side navigation (AppShell folds the side nav into a menu on phones).
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { ROLES, filterPostings, isNewPosting, remainingDays, type Filters, type Posting } from "@/lib/domain";
import { isClosingSoon, nextDeadline } from "@/lib/posting-format";
import type { View } from "./chrome";
import { clearStoredPostings } from "./posting-store";
import type { ThemeMode } from "@/lib/theme-mode";
import { ThemeToggle } from "./theme-toggle";
import type { Mode } from "./use-personal";

const GUIDE_URL = "https://intern.hanyang.ac.kr/boards/205/view";

function LogoutButton(): React.ReactElement {
  return (
    <form
      action="/auth/logout"
      method="POST"
      onSubmit={e => {
        // Drop this browser's copy of the postings before signing out, then submit as usual.
        e.preventDefault();
        const form = e.currentTarget;
        void clearStoredPostings().finally(() => form.submit());
      }}
    >
      <IconButton type="submit" variant="ghost" size="sm" label="로그아웃" icon={<LogOut size={16} />} />
    </form>
  );
}

type TopNavProps = {
  mode: Mode;
  userLabel: string;
  theme: ThemeMode;
  onTheme: (theme: ThemeMode) => void;
  onHome: () => void;
};

export function AppTopNav({ mode, userLabel, theme, onTheme, onHome }: TopNavProps): React.ReactElement {
  return (
    <TopNav
      label="HY-Easy"
      heading={
        <TopNavHeading
          heading="HY-Easy"
          headingHref={mode === "demo" ? "/demo" : "/postings"}
          as={Link}
          onClick={e => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            onHome();
          }}
          headerEndContent={mode === "demo" ? <span className="side-count">데모</span> : undefined}
        />
      }
      endContent={
        <HStack gap={2} align="center">
          <ThemeToggle mode={theme} onChange={onTheme} />
          {/* No tooltip: it made this static avatar a Tab stop that does nothing. */}
          <Avatar name={userLabel} size="sm" tooltip={false} />
          {mode === "live" && <LogoutButton />}
        </HStack>
      }
    />
  );
}

export type When = "" | "open" | "soon" | "new";

type SideNavProps = {
  view: View;
  filters: Filters;
  postings: Posting[];
  now: Date;
  openCount: number;
  favoriteCount: number;
  hasActive: boolean;
  isAdmin: boolean;
  navigate: (view: View) => void;
  selectWhen: (when: When) => void;
  selectRole: (role: string) => void;
  onOpen: (posting: Posting) => void;
  onFeedback: () => void;
};

function Count({ value, isStrong }: { value: number; isStrong?: boolean }): React.ReactElement {
  return (
    <span className="side-count" data-strong={isStrong && value > 0 ? "" : undefined}>
      {value}
    </span>
  );
}

/** The demo's "다음 마감" card: the open posting that closes first, one click from its details. */
function NextDeadline({ next, now, onOpen }: { next: Posting | null; now: Date; onOpen: SideNavProps["onOpen"] }) {
  if (!next) return null;
  const days = remainingDays(next, now);
  return (
    <Card variant="muted" padding={3}>
      <VStack gap={1}>
        <Text type="supporting">다음 마감 · {days !== null && days > 0 ? `D-${days}` : "D-day"}</Text>
        <Text weight="semibold" maxLines={2}>
          {next.title}
        </Text>
        <Text type="supporting">{next.company}</Text>
        <Button variant="secondary" size="sm" label="공고 보기" onClick={() => onOpen(next)} />
      </VStack>
    </Card>
  );
}

export function AppSideNav(props: SideNavProps): React.ReactElement {
  const { view, filters, postings, now, navigate } = props;
  // Same rule as the list: primary or secondary role, closed postings included.
  const roleCount = (role: string) => filterPostings(postings, { role }).length;
  const listView = view === "postings";
  const when = (filters.when ?? "") as When;
  return (
    <SideNav
      footer={
        <VStack gap={2}>
          <NextDeadline next={nextDeadline(postings, now)} now={now} onOpen={props.onOpen} />
          <Button variant="ghost" size="sm" label="피드백 보내기" onClick={props.onFeedback} />
          <Button
            variant="ghost"
            size="sm"
            label="현장실습 지원 안내"
            href={GUIDE_URL}
            target="_blank"
            rel="noreferrer"
          />
        </VStack>
      }
    >
      <SideNavSection title="공고 보기">
        <SideNavItem
          label="전체 공고"
          isSelected={listView && !when && !filters.role}
          onClick={() => props.selectWhen("")}
          endContent={<Count value={postings.length} />}
        />
        <SideNavItem
          label="모집 중"
          isSelected={listView && when === "open"}
          onClick={() => props.selectWhen("open")}
          endContent={<Count value={props.openCount} />}
        />
        <SideNavItem
          label="마감 임박"
          isSelected={listView && when === "soon"}
          onClick={() => props.selectWhen("soon")}
          endContent={<Count value={postings.filter(p => isClosingSoon(p, now)).length} isStrong />}
        />
        <SideNavItem
          label="신규 공고"
          isSelected={listView && when === "new"}
          onClick={() => props.selectWhen("new")}
          endContent={<Count value={postings.filter(p => isNewPosting(p, now)).length} />}
        />
      </SideNavSection>
      <SideNavSection title="내 활동">
        <SideNavItem
          label="관심 공고"
          isSelected={view === "saved"}
          onClick={() => navigate("saved")}
          endContent={<Count value={props.favoriteCount} />}
        />
        <SideNavItem
          label="지원 플래너"
          isSelected={view === "planner"}
          onClick={() => navigate("planner")}
          endContent={props.hasActive ? <Badge variant="info" label="진행 중" /> : undefined}
        />
        {props.isAdmin && <SideNavItem label="관리자" href="/admin" as={Link} />}
      </SideNavSection>
      <SideNavSection title="직군별">
        {ROLES.map(role => (
          <SideNavItem
            key={role}
            label={role}
            size="sm"
            isSelected={listView && filters.role === role}
            onClick={() => props.selectRole(role)}
            endContent={<Count value={roleCount(role)} />}
          />
        ))}
      </SideNavSection>
    </SideNav>
  );
}
