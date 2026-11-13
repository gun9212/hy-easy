"use client";

import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { PostingDetail } from "@demo/lib/list-posting";
import { PostingText } from "./posting-text";

type State = { id: string; detail: PostingDetail | null; error: string | null };
type TextKey = "practiceInfo" | "tasks" | "qualifications" | "benefits";

const SECTIONS: { key: TextKey; title: string }[] = [
  { key: "practiceInfo", title: "실습 내용" },
  { key: "tasks", title: "수행 업무" },
  { key: "qualifications", title: "자격 요건" },
  { key: "benefits", title: "혜택" },
];
const EVIDENCE_FIELDS: Record<string, string> = {
  practiceInfo: "실습 내용",
  qualifications: "자격 요건",
  tasks: "수행 업무",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The API is ours, but the response still crosses a boundary: check every field the drawer reads. */
function isDetail(value: unknown, id: string): value is PostingDetail {
  if (!isRecord(value) || value.id !== id) return false;
  const texts = SECTIONS.every(s => typeof value[s.key] === "string");
  const events =
    Array.isArray(value.events) &&
    value.events.every(e => isRecord(e) && typeof e.label === "string" && typeof e.raw === "string");
  const evidence =
    Array.isArray(value.evidence) &&
    value.evidence.every(e => isRecord(e) && typeof e.field === "string" && typeof e.quote === "string");
  return texts && events && evidence;
}

async function fetchDetail(id: string, signal: AbortSignal): Promise<PostingDetail> {
  const response = await fetch(`/api/postings/${encodeURIComponent(id)}`, { signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) ? body.error : null;
    throw new Error(typeof message === "string" ? message : "공고 내용을 읽지 못했습니다.");
  }
  if (!isDetail(body, id)) throw new Error("공고 내용 형식이 올바르지 않습니다.");
  return body;
}

function Events({ events }: { events: PostingDetail["events"] }): React.ReactElement | null {
  if (events.length === 0) return null;
  return (
    <VStack gap={1}>
      <Heading level={3}>전형 일정</Heading>
      <ul className="pt-list">
        {events.map((e, i) => (
          <li key={i} className="pt-labeled">
            <Text weight="semibold">{e.label}</Text>
            <Text>{e.raw}</Text>
          </li>
        ))}
      </ul>
    </VStack>
  );
}

/** Which sentences the classifier based the role on; folded, since most readers only need the result. */
function Evidence({ evidence }: { evidence: PostingDetail["evidence"] }): React.ReactElement | null {
  if (evidence.length === 0) return null;
  return (
    <Collapsible
      chevronPosition="start"
      defaultIsOpen={false}
      trigger={<Text type="supporting">직무 분류 근거 {evidence.length}개</Text>}
    >
      <ul className="pt-list">
        {evidence.map((e, i) => (
          <li key={i} className="pt-labeled">
            <Text type="supporting">{EVIDENCE_FIELDS[e.field] ?? e.field}</Text>
            <Text size="sm">“{e.quote}”</Text>
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

/** The drawer's long texts, fetched when a posting opens so the list page carries only summaries. */
export function PostingDetailSections({ id }: { id: string }): React.ReactElement {
  const [state, setState] = useState<State>({ id, detail: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    fetchDetail(id, controller.signal)
      .then(detail => setState({ id, detail, error: null }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({ id, detail: null, error: cause instanceof Error ? cause.message : "공고 내용을 읽지 못했습니다." });
      });
    return () => controller.abort();
  }, [id]);

  // A state left over from the previous posting counts as loading.
  const current = state.id === id ? state : { id, detail: null, error: null };
  if (current.error) return <Banner status="error" title={current.error} collapsible={false} />;
  const { detail } = current;
  return (
    <VStack gap={4}>
      {SECTIONS.map(section => (
        <VStack key={section.key} gap={1}>
          <Heading level={3}>{section.title}</Heading>
          {detail ? <PostingText text={detail[section.key]} /> : <Skeleton height={40} />}
        </VStack>
      ))}
      {detail && <Events events={detail.events} />}
      {detail && <Evidence evidence={detail.evidence} />}
    </VStack>
  );
}
