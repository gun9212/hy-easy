"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, GitCompareArrows, Plus, X } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { Posting } from "@/lib/domain";
import { DEMO_NOW, samplePostings } from "@/lib/sample";
import { LayoutProvider } from "./workspace/layout-context";
import { PostingResults } from "./workspace/posting-results";

// Loaded on first open so /login does not ship detail/comparison code before the user interacts with them.
const ComparisonTable = dynamic(() => import("./workspace/comparison").then(mod => mod.ComparisonTable), {
  ssr: false,
  loading: () => (
    <Text type="supporting" role="status">
      비교 표를 불러오는 중…
    </Text>
  ),
});
const PostingDetail = dynamic(() => import("./workspace/posting-detail").then(mod => mod.PostingDetail), {
  ssr: false,
});

const PREVIEW_NOW = new Date(DEMO_NOW);
// Four fictional postings (A사–D사) sorted by deadline, matching the workspace's default view.
const PREVIEW_POSTINGS: Posting[] = [samplePostings[2], samplePostings[0], samplePostings[1], samplePostings[3]];

export function LandingPreview({ demoEnabled = false }: { demoEnabled?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "compare">("list");
  const [compared, setCompared] = useState<string[]>([PREVIEW_POSTINGS[0].id, PREVIEW_POSTINGS[1].id]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<string>("");

  const selected = compared.map(id => PREVIEW_POSTINGS.find(p => p.id === id)).filter((p): p is Posting => Boolean(p));
  const unselected = PREVIEW_POSTINGS.filter(p => !compared.includes(p.id));
  const detail = detailId ? (PREVIEW_POSTINGS.find(p => p.id === detailId) ?? null) : null;

  function toggleCompare(id: string) {
    setCompared(prev => {
      const next = prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id];
      if (next.length === 0) setMode("list");
      return next;
    });
  }

  function toggleFavorite(id: string) {
    setFavoriteIds(prev => (prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]));
  }

  return (
    <LayoutProvider initialNarrow={false}>
      <section className="landing-preview" aria-label="실제 공고 목록과 비교 예시">
        <VStack gap={3}>
          <HStack gap={2} align="center" justify="between" wrap="wrap">
            <HStack gap={2} align="center" wrap="wrap">
              <Badge variant="blue" label="예시" />
              <SegmentedControl
                label="예시 화면 전환"
                value={mode}
                onChange={next => {
                  if (next === "compare" && selected.length === 0) return;
                  setMode(next as "list" | "compare");
                }}
              >
                <SegmentedControlItem value="list" label="공고 목록" />
                <SegmentedControlItem
                  value="compare"
                  label={selected.length ? `나란히 비교 (${selected.length})` : "나란히 비교"}
                />
              </SegmentedControl>
            </HStack>
            <Text size="sm" color="secondary">
              가상 공고 예시 · 눌러서 상세와 비교를 체험해 보세요
            </Text>
          </HStack>

          {planNotice && (
            <div role="status">
              <Banner status="info" title="로그인 후 이용할 수 있어요" description={planNotice} collapsible={false} />
            </div>
          )}

          {mode === "list" ? (
            <>
              <div className="preview-table-frame">
                <PostingResults
                  postings={PREVIEW_POSTINGS}
                  applications={[]}
                  favoriteIds={favoriteIds}
                  compared={compared}
                  now={PREVIEW_NOW}
                  major={null}
                  hideBookmark
                  onCompare={toggleCompare}
                  onOpen={p => setDetailId(p.id)}
                  onFavorite={toggleFavorite}
                />
              </div>
              <div className="preview-dock">
                <div className="preview-dock-left">
                  <GitCompareArrows size={16} aria-hidden="true" />
                  <span className="preview-dock-count">
                    {selected.length ? `${selected.length}개 공고 선택` : "비교할 공고를 체크해 보세요"}
                  </span>
                  {selected.length > 0 && (
                    <div className="preview-dock-chips">
                      {selected.map(p => (
                        <span key={p.id} className="preview-dock-chip">
                          {p.company}
                          <button
                            type="button"
                            aria-label={`${p.company} 비교 해제`}
                            onClick={() => toggleCompare(p.id)}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="preview-dock-actions">
                  {selected.length > 0 && (
                    <Button variant="ghost" size="sm" label="초기화" onClick={() => setCompared([])} />
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    label="나란히 비교하기"
                    endContent={<ArrowRight size={14} />}
                    isDisabled={selected.length === 0}
                    onClick={() => setMode("compare")}
                  />
                </div>
              </div>
            </>
          ) : (
            <Card padding={5}>
              <VStack gap={3}>
                <HStack gap={2} align="center" justify="between" wrap="wrap">
                  <Heading level={2}>같은 기준으로, 나란히 비교</Heading>
                  <HStack gap={1.5} align="center" wrap="wrap">
                    {unselected.map(p => (
                      <Button
                        key={p.id}
                        variant="ghost"
                        size="sm"
                        icon={<Plus size={14} />}
                        label={`${p.company} 추가`}
                        onClick={() => toggleCompare(p.id)}
                      />
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<ArrowLeft size={14} />}
                      label="목록 보기"
                      onClick={() => setMode("list")}
                    />
                  </HStack>
                </HStack>
                <ComparisonTable postings={selected} applications={[]} now={PREVIEW_NOW} />
              </VStack>
            </Card>
          )}
        </VStack>

        {detail && (
          <PostingDetail
            posting={detail}
            major={null}
            applications={[]}
            now={PREVIEW_NOW}
            saved={favoriteIds.includes(detail.id)}
            onFavorite={() => toggleFavorite(detail.id)}
            close={() => setDetailId(null)}
            onPlan={() => {
              const target = detail;
              setDetailId(null);
              if (demoEnabled) {
                router.push(`/demo?saved=planner&posting=${encodeURIComponent(target.id)}`);
              } else {
                setPlanNotice(
                  `${target.company} 지원 일정 관리는 @hanyang.ac.kr 계정으로 로그인한 뒤 이용할 수 있어요.`,
                );
              }
            }}
          />
        )}
      </section>
    </LayoutProvider>
  );
}
