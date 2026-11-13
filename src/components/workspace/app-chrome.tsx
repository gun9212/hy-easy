"use client";

// Page chrome on Astryx: the top bar and the side navigation (AppShell folds the side nav into a menu on phones).
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { ROLES, filterPostings, type Filters, type Posting } from "@/lib/domain";
import type { View } from "./chrome";
import { clearStoredPostings } from "./posting-store";
import type { Mode } from "./use-personal";

const HYWEP_URL = "https://hywep.hanyang.ac.kr/";
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

export function AppTopNav({ mode, userLabel }: { mode: Mode; userLabel: string }): React.ReactElement {
  return (
    <TopNav
      label="HY-Easy"
      heading={
        <TopNavHeading
          // eslint-disable-next-line @next/next/no-img-element
          logo={<img src="/brand/hyu-symbol.svg" alt="" width={30} height={30} />}
          heading="HY-Easy"
          headingHref={mode === "demo" ? "/demo" : "/postings"}
          as={Link}
          headerEndContent={mode === "demo" ? <Badge variant="info" label="데모" /> : undefined}
        />
      }
      endContent={
        <HStack gap={2} align="center">
          <Button variant="ghost" size="sm" label="HY-WEP" href={HYWEP_URL} target="_blank" rel="noreferrer" />
          <Avatar name={userLabel} size="sm" />
          {mode === "live" && <LogoutButton />}
        </HStack>
      }
    />
  );
}

type SideNavProps = {
  view: View;
  filters: Filters;
  postings: Posting[];
  openCount: number;
  favoriteCount: number;
  hasActive: boolean;
  isAdmin: boolean;
  navigate: (view: View) => void;
  selectRole: (role: string) => void;
};

function Count({ value }: { value: number | string }): React.ReactElement {
  return <Text type="supporting">{value}</Text>;
}

export function AppSideNav(props: SideNavProps): React.ReactElement {
  const { view, filters, postings, navigate } = props;
  // Same rule as the list: primary or secondary role, closed postings only when the list shows them.
  const roleCount = (role: string) => filterPostings(postings, { role, closed: filters.closed }).length;
  return (
    <SideNav
      footer={
        <Button
          variant="ghost"
          size="sm"
          label="현장실습 지원 안내"
          href={GUIDE_URL}
          target="_blank"
          rel="noreferrer"
        />
      }
    >
      <SideNavSection title="메뉴">
        <SideNavItem
          label="실습 공고"
          isSelected={view === "postings" && !filters.role}
          onClick={() => navigate("postings")}
          endContent={<Count value={props.openCount} />}
        />
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
      <SideNavSection title="직군으로 탐색">
        {ROLES.map(role => (
          <SideNavItem
            key={role}
            label={role}
            size="sm"
            isSelected={filters.role === role}
            onClick={() => props.selectRole(role)}
            endContent={<Count value={roleCount(role)} />}
          />
        ))}
      </SideNavSection>
    </SideNav>
  );
}
