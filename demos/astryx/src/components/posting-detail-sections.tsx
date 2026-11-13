"use client";

import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/Stack";
import type { PostingDetail } from "@demo/lib/list-posting";
import { PostingText } from "./posting-text";

type State = { id: string; detail: PostingDetail | null; error: string | null };

const SECTIONS: { key: keyof Omit<PostingDetail, "id">; title: string }[] = [
  { key: "practiceInfo", title: "실습 내용" },
  { key: "tasks", title: "수행 업무" },
  { key: "qualifications", title: "자격 요건" },
  { key: "benefits", title: "혜택" },
];

function isDetail(value: unknown, id: string): value is PostingDetail {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.id === id && SECTIONS.every(s => typeof v[s.key] === "string");
}

async function fetchDetail(id: string, signal: AbortSignal): Promise<PostingDetail> {
  const response = await fetch(`/api/postings/${encodeURIComponent(id)}`, { signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" ? message : "공고 내용을 읽지 못했습니다.");
  }
  if (!isDetail(body, id)) throw new Error("공고 내용 형식이 올바르지 않습니다.");
  return body;
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
  return (
    <VStack gap={4}>
      {SECTIONS.map(section => (
        <VStack key={section.key} gap={1}>
          <Heading level={3}>{section.title}</Heading>
          {current.detail ? <PostingText text={current.detail[section.key]} /> : <Skeleton height={40} />}
        </VStack>
      ))}
    </VStack>
  );
}
