"use client";

// The sections inside the posting drawer (posting-detail.tsx).
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { deadlineLabel, majorFit, MAJOR_FIT_LABELS, stipendLabel, type Posting } from "@/lib/domain";
import type { Major } from "@/lib/majors";
import { PostingText } from "./posting-text";

export function Facts({ posting: p }: { posting: Posting }): React.ReactElement {
  const facts: [string, string][] = [
    ["지원금", stipendLabel(p)],
    ["마감시간 · 한국 시간", deadlineLabel(p)],
    ["실습 기간", p.period || "미기재"],
    ["근무 지역", p.location || "미기재"],
    ["모집 인원", p.headcount !== null ? `${p.headcount}명` : "미기재"],
    ["지원 인원", p.applicants !== null ? `${p.applicants}명` : "미기재"],
    ["모집 학기", p.term || "미기재"],
    ["유형", p.programType || "미기재"],
  ];
  return (
    <Card variant="muted" padding={4}>
      <Grid columns={2} gap={3}>
        {facts.map(([label, value]) => (
          <VStack key={label} gap={0.5}>
            <Text type="supporting">{label}</Text>
            <Text weight="semibold">{value}</Text>
          </VStack>
        ))}
      </Grid>
    </Card>
  );
}

const EVIDENCE_FIELDS = { practiceInfo: "실습정보", qualifications: "자격사항", tasks: "실습내용" } as const;

/** The AI summary and role, marked as AI-written, with the quotes it was based on (folded). */
export function Classification({ posting: p }: { posting: Posting }): React.ReactElement | null {
  const c = p.classification;
  if (!c) return null;
  const needsReview = c.needsReview || p.classificationStale;
  return (
    <Card variant="blue" padding={4}>
      <VStack gap={2}>
        <HStack gap={1.5} align="center" wrap="wrap">
          <Badge variant="info" label={p.classificationSource === "sample" ? "직군 분류 예시" : "AI 요약"} />
          <Badge variant="blue" label={c.primaryRole} />
          <Text type="supporting">원문을 바탕으로 자동 작성 · 아래 원문을 꼭 확인하세요</Text>
        </HStack>
        <Text as="p">{c.summary}</Text>
        {needsReview && <Text type="supporting">원문 변경 또는 모호한 업무로 관리자 검토가 필요합니다.</Text>}
        {c.evidence.length > 0 && (
          <Collapsible
            chevronPosition="start"
            defaultIsOpen={false}
            trigger={<Text type="supporting">분류 근거 {c.evidence.length}개</Text>}
          >
            <ul className="pt-list">
              {c.evidence.map((e, i) => (
                <li key={i} className="pt-labeled">
                  <Text type="supporting">{EVIDENCE_FIELDS[e.field]}</Text>
                  <Text size="sm">“{e.quote}”</Text>
                </li>
              ))}
            </ul>
          </Collapsible>
        )}
      </VStack>
    </Card>
  );
}

const REQUIREMENT_LABELS = { listed: "지정 전공만 지원", any: "전공 무관", unknown: "원문 확인 필요" } as const;

export function Majors({ posting: p, major }: { posting: Posting; major: Major | null }): React.ReactElement | null {
  const m = p.classification?.majors;
  if (!m) return null;
  const fit = majorFit(p, major);
  const rows: [string, readonly string[]][] = [
    ["지원 조건", [REQUIREMENT_LABELS[m.requirement]]],
    ["지원 가능 전공", m.required],
    ["우대 전공", m.preferred],
    ["업무와 이어지는 전공", m.related],
  ];
  return (
    <VStack gap={1.5}>
      <HStack gap={2} align="center">
        <Heading level={3}>전공</Heading>
        {fit !== "none" && <Badge variant={fit === "other" ? "neutral" : "green"} label={MAJOR_FIT_LABELS[fit]} />}
      </HStack>
      {fit === "adjacent" && (
        <Text type="supporting">
          내 전공과 같은 분야의 전공을 대상으로 하는 공고입니다. 관련 전공으로 지원할 수 있는지 자격사항이나 담당자에게
          확인하세요.
        </Text>
      )}
      <ul className="pt-list">
        {rows
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => (
            <li key={label} className="pt-labeled">
              <Text type="supporting">{label}</Text>
              <Text>{list.join(", ")}</Text>
            </li>
          ))}
      </ul>
      {p.majors && <Text type="supporting">원문: {p.majors}</Text>}
    </VStack>
  );
}

export function Events({ posting: p }: { posting: Posting }): React.ReactElement | null {
  if (!p.events.length) return null;
  return (
    <VStack gap={1.5}>
      <Heading level={3}>선발 일정</Heading>
      <ul className="pt-list">
        {p.events.map((e, i) => (
          <li key={i} className="pt-labeled">
            <Text weight="semibold">{e.label}</Text>
            <Text>{e.raw}</Text>
          </li>
        ))}
      </ul>
      <Text type="supporting">결과 발표일과 HY-WEP 탈락 처리 완료 시각은 다를 수 있습니다.</Text>
    </VStack>
  );
}

/** HY-WEP's own texts, laid out by the template parser (lib/posting-text.ts). */
export function OriginalTexts({ posting: p }: { posting: Posting }): React.ReactElement {
  const sections: [string, string][] = [
    ["실습정보", p.practiceInfo],
    ["실습내용", p.tasks],
    ["자격사항", p.qualifications],
    ["근무 조건", p.benefits],
  ];
  return (
    <VStack gap={4}>
      <Text type="supporting" weight="semibold">
        HY-WEP 원문
      </Text>
      {sections.map(([label, value]) => (
        <VStack key={label} gap={1}>
          <Heading level={3}>{label}</Heading>
          {value ? <PostingText text={value} /> : <Text type="supporting">원문 미기재</Text>}
        </VStack>
      ))}
    </VStack>
  );
}
