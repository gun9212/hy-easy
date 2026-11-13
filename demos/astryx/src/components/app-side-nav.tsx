"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { ROLES, type Role } from "@lib/domain";
import type { ListPosting as Posting } from "@demo/lib/list-posting";
import { deadlineLabel } from "./format";

export type View = "all" | "soon" | "new";
export const VIEW_LABELS: Record<View, string> = { all: "전체 공고", soon: "마감 임박", new: "새로 올라온 공고" };

type Props = {
  view: View;
  role: Role | null;
  viewCounts: Record<View, number>;
  roleCounts: Map<Role, number>;
  next: Posting | null;
  now: string;
  onView: (view: View) => void;
  onRole: (role: Role | null) => void;
  onOpen: (posting: Posting) => void;
};

function Count({ n, isStrong }: { n: number; isStrong?: boolean }): React.ReactElement {
  return isStrong && n > 0 ? <Badge variant="warning" label={n} /> : <Text type="supporting">{n}</Text>;
}

function NextDeadline({ next, now, onOpen }: Pick<Props, "next" | "now" | "onOpen">): React.ReactElement | null {
  if (!next) return null;
  return (
    <Card variant="muted" padding={3}>
      <VStack gap={1}>
        <Text type="supporting">다음 마감 · {deadlineLabel(next, now)}</Text>
        <Text weight="semibold" maxLines={2}>
          {next.title}
        </Text>
        <Text type="supporting">{next.company}</Text>
        <Button variant="secondary" size="sm" label="공고 보기" onClick={() => onOpen(next)} />
      </VStack>
    </Card>
  );
}

export function AppSideNav(props: Props): React.ReactElement {
  const { view, role, viewCounts, roleCounts, onView, onRole } = props;
  return (
    <SideNav footer={<NextDeadline next={props.next} now={props.now} onOpen={props.onOpen} />}>
      <SideNavSection title="공고 보기">
        {(Object.keys(VIEW_LABELS) as View[]).map(v => (
          <SideNavItem
            key={v}
            label={VIEW_LABELS[v]}
            isSelected={view === v && role === null}
            onClick={() => {
              onView(v);
              onRole(null);
            }}
            endContent={<Count n={viewCounts[v]} isStrong={v === "soon"} />}
          />
        ))}
      </SideNavSection>
      <SideNavSection title="직무별">
        {ROLES.filter(r => roleCounts.has(r)).map(r => (
          <SideNavItem
            key={r}
            label={r}
            size="sm"
            isSelected={role === r}
            onClick={() => onRole(role === r ? null : r)}
            endContent={<Count n={roleCounts.get(r) ?? 0} />}
          />
        ))}
      </SideNavSection>
      <SideNavSection title="내 활동">
        <SideNavItem label="관심 공고" onClick={() => undefined} endContent={<Count n={0} />} />
        <SideNavItem label="지원 현황" onClick={() => undefined} endContent={<Count n={0} />} />
      </SideNavSection>
    </SideNav>
  );
}
