"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { ToastViewport, useToast } from "@astryxdesign/core/Toast";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { formatDate, isBlocking, type Application, type Filters, type Posting } from "@/lib/domain";
import { isClosingSoon, isOpenPosting, isUnknownRecruitment } from "@/lib/posting-format";
import { filtersFromSearchParams } from "@/lib/posting-query";
import { searchOfFilters, shouldPushHistory, viewOfFilters } from "@/lib/workspace-history";
import { Comparison } from "./comparison";
import { AppSideNav, AppTopNav } from "./app-chrome";
import { FeedbackDialog } from "./feedback-dialog";
import { CompareDock, type View } from "./chrome";
import { LayoutProvider } from "./layout-context";
import { Planner } from "./planner";
import { PostingDetail } from "./posting-detail";
import { PostingsView, listTitle } from "./postings-view";
import { useMajor } from "./use-major";
import { usePostings } from "./use-postings";
import { usePersonal, type Mode } from "./use-personal";
import type { Major } from "@/lib/majors";
import type { ThemeMode } from "@/lib/theme-mode";

type Props = {
  mode: Mode;
  /** Demo: the sample postings. Live: null, and the browser loads them (see usePostings). */
  postings: Posting[] | null;
  initialFavorites: string[];
  initialApplications: Application[];
  initialFilters: Filters;
  initialNow: string;
  initialMajor: Major | null;
  userLabel: string;
  isAdmin: boolean;
  /** The theme the student picked, from the cookie (the layout already put it on <html>). */
  initialTheme: ThemeMode;
};

const MAX_COMPARE = 4;
const HYWEP_URL = "https://hywep.hanyang.ac.kr/";
const CLOCK_TICK_MS = 30_000;
const TOAST_MS = 4_200;
const HEADINGS: Record<View, { title: string; text: string }> = {
  postings: {
    title: "실습 공고",
    text: "어떤 일을 하는지부터 언제 지원할지까지, 나에게 맞는 기회를 찾아보세요.",
  },
  saved: {
    title: "관심 공고",
    text: "저장해 둔 공고를 같은 기준으로 비교해 보세요.",
  },
  planner: {
    title: "지원 플래너",
    text: "지금의 지원 상태와 다음 기회의 마감시간을 함께 확인하세요.",
  },
};

function useClock(mode: Mode, initialNow: string): Date {
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    if (mode === "demo") return;
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [mode]);
  return now;
}

/** The demo's one line under the title: what the list is, and when the collector last checked it. */
function sourceLine(mode: Mode, lastChecked: string | undefined): string {
  if (mode === "demo") return "한양대학교 HY-WEP 현장실습 공고 · 가상 데이터";
  const checked = lastChecked ? `${formatDate(lastChecked, true)} 확인` : "첫 수집 대기";
  return `한양대학교 HY-WEP 현장실습 공고 · ${checked} · 평일 09–18시 10분 간격 수집`;
}

type InnerProps = Props & { theme: ThemeMode; onTheme: (theme: ThemeMode) => void };

function WorkspaceInner({
  mode,
  postings: initialPostings,
  initialFavorites,
  initialApplications,
  initialFilters,
  initialNow,
  initialMajor,
  userLabel,
  isAdmin,
  theme,
  onTheme,
}: InnerProps) {
  const { postings, ready, lastCheckedAt, error: loadError } = usePostings(mode, initialPostings);
  const { personal, toggleFavorite, recordApplication, deleteApplication } = usePersonal(mode, {
    favoriteIds: initialFavorites,
    applications: initialApplications,
  });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [compared, setCompared] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const now = useClock(mode, initialNow);
  const { major, chooseMajor } = useMajor(mode, initialMajor);
  const notify = (body: string, type: "info" | "error" = "info") =>
    showToast({ body, type, isAutoHide: true, autoHideDuration: type === "error" ? 6_000 : TOAST_MS });

  async function changeMajor(next: Major | null) {
    try {
      await chooseMajor(next);
      if (!next) {
        setFilters(prev => {
          if (!prev.mine && !prev.others) return prev;
          const { page: _page, ...rest } = prev;
          void _page;
          return { ...rest, mine: "", others: "" };
        });
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "전공을 저장하지 못했습니다.", "error");
    }
  }
  const view = viewOfFilters(filters);
  const prevFiltersRef = useRef<Filters>(initialFilters);
  const poppingRef = useRef(false);

  useEffect(() => {
    const onPop = () => {
      poppingRef.current = true;
      const next = filtersFromSearchParams(new URLSearchParams(window.location.search));
      prevFiltersRef.current = next;
      setFilters(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (poppingRef.current) {
      poppingRef.current = false;
      return;
    }
    const nextSearch = searchOfFilters(filters);
    const prev = prevFiltersRef.current;
    prevFiltersRef.current = filters;
    if (nextSearch !== window.location.search) {
      const nextUrl = `${window.location.pathname}${nextSearch}`;
      if (shouldPushHistory(prev, filters)) {
        window.history.pushState(null, "", nextUrl);
      } else {
        window.history.replaceState(null, "", nextUrl);
      }
    }
  }, [filters]);

  function updateFilters(patch: Filters) {
    setFilters(prev => {
      const { page: _page, ...rest } = prev;
      void _page;
      return { ...rest, ...patch };
    });
  }
  function resetFilters() {
    setFilters({});
    setMobileMenu(false);
  }
  function navigate(next: View, postingId?: string) {
    // A side-nav tab starts a fresh view so filters from the previous tab never hide saved postings.
    const saved = next === "saved" ? "true" : next === "planner" ? "planner" : "";
    setFilters(prev => {
      const base: Filters = {};
      if (saved) base.saved = saved;
      if (next === "planner" && postingId) base.posting = postingId;
      if (prev.sort) base.sort = prev.sort;
      return base;
    });
    setMobileMenu(false);
  }
  async function favorite(id: string) {
    if (saving) return;
    setSaving(true);
    try {
      await toggleFavorite(id);
    } catch (e) {
      notify(e instanceof Error ? e.message : "저장하지 못했습니다.", "error");
    } finally {
      setSaving(false);
    }
  }
  async function record(postingId: string, status: Parameters<typeof recordApplication>[1], confirmed: boolean) {
    await recordApplication(postingId, status, confirmed);
    notify("지원 상태를 기록했어요.");
  }
  async function remove(postingId: string) {
    await deleteApplication(postingId);
    notify("지원 기록을 삭제했어요.");
  }
  function compare(id: string) {
    if (compared.includes(id)) setCompared(compared.filter(v => v !== id));
    else if (compared.length === MAX_COMPARE) notify(`공고는 최대 ${MAX_COMPARE}개까지 비교할 수 있어요.`);
    else setCompared([...compared, id]);
  }

  const active = personal.applications.find(a => isBlocking(a.status));
  const stats = {
    open: postings.filter(p => isOpenPosting(p, now)).length,
    unknown: postings.filter(p => isUnknownRecruitment(p, now)).length,
    closingSoon: postings.filter(p => isClosingSoon(p, now)).length,
    activeCompany: postings.find(p => p.id === active?.postingId)?.company ?? null,
    hasActive: Boolean(active),
  };
  const lastChecked =
    lastCheckedAt ??
    postings
      .map(p => p.lastCheckedAt)
      .sort()
      .at(-1);
  const selected = compared.map(id => postings.find(p => p.id === id)).filter((p): p is Posting => Boolean(p));
  const detail = detailId ? (postings.find(p => p.id === detailId) ?? null) : null;
  const heading = HEADINGS[view];

  return (
    <AppShell
      topNav={<AppTopNav mode={mode} userLabel={userLabel} theme={theme} onTheme={onTheme} onHome={resetFilters} />}
      sideNav={
        <AppSideNav
          view={view}
          filters={filters}
          postings={postings}
          openCount={stats.open}
          favoriteCount={personal.favoriteIds.length}
          hasActive={stats.hasActive}
          isAdmin={isAdmin}
          navigate={navigate}
          now={now}
          onOpen={p => {
            setDetailId(p.id);
            setMobileMenu(false);
          }}
          onFeedback={() => {
            setFeedbackOpen(true);
            setMobileMenu(false);
          }}
          selectWhen={when => {
            updateFilters({ when, saved: "", role: "", q: "" });
            setMobileMenu(false);
          }}
          selectRole={role => {
            updateFilters({ role: filters.role === role ? "" : role, when: "", saved: "", q: "" });
            setMobileMenu(false);
          }}
        />
      }
      mobileNav={{ isOpen: mobileMenu, onOpenChange: setMobileMenu }}
      contentPadding={5}
    >
      <VStack gap={4} className={selected.length ? "has-compare-dock" : undefined}>
        {mode === "demo" && (
          <p className="demo-note">
            <span>데모 · 가상 기업과 공고, 일정 기준 2026.11.10 13:00</span>
            <Link href="/login">로그인 안내</Link>
          </p>
        )}
        <HStack gap={3} align="end" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={1}>{view === "planner" ? heading.title : listTitle(filters)}</Heading>
            <Text type="supporting">{view === "planner" ? heading.text : sourceLine(mode, lastChecked)}</Text>
          </VStack>
          <Button variant="primary" label="HY-WEP 바로가기" href={HYWEP_URL} target="_blank" rel="noreferrer" />
        </HStack>
        {loadError && (
          <Banner
            status="error"
            title={loadError}
            description={postings.length ? "저장해 둔 목록을 보여드려요." : "새로고침해 주세요."}
            collapsible={false}
          />
        )}
        {!ready ? (
          <Text type="supporting" role="status">
            공고를 불러오는 중…
          </Text>
        ) : view === "planner" ? (
          <Planner
            postings={postings}
            applications={personal.applications}
            record={record}
            remove={remove}
            now={now}
            initialPostingId={filters.posting ?? null}
          />
        ) : (
          <PostingsView
            postings={postings}
            filters={filters}
            major={major}
            onMajor={changeMajor}
            updateFilters={updateFilters}
            resetFilters={resetFilters}
            favoriteIds={personal.favoriteIds}
            applications={personal.applications}
            compared={compared}
            now={now}
            stats={stats}
            onCompare={compare}
            onOpenCompare={() =>
              compared.length ? setCompareOpen(true) : notify("공고의 비교 체크박스를 선택해 주세요.")
            }
            onOpen={p => setDetailId(p.id)}
            onFavorite={favorite}
            onPlanner={() => navigate("planner")}
          />
        )}
        <HStack gap={3} wrap="wrap">
          <Text type="supporting">HY-Easy · 한양인의 더 나은 선택</Text>
          <Text type="supporting">한양대학교 비공식 서비스</Text>
          <Link href="/privacy">개인정보처리방침</Link>
          <button type="button" className="text-link" onClick={() => setFeedbackOpen(true)}>
            피드백 보내기
          </button>
        </HStack>
      </VStack>
      <CompareDock
        selected={selected}
        onRemove={compare}
        onReset={() => setCompared([])}
        onOpen={() => setCompareOpen(true)}
      />
      {detail && (
        <PostingDetail
          posting={detail}
          major={major}
          applications={personal.applications}
          now={now}
          saved={personal.favoriteIds.includes(detail.id)}
          onFavorite={() => favorite(detail.id)}
          close={() => setDetailId(null)}
          onPlan={() => {
            const targetId = detail.id;
            setDetailId(null);
            navigate("planner", targetId);
          }}
        />
      )}
      {compareOpen && (
        <Comparison
          postings={selected}
          close={() => setCompareOpen(false)}
          applications={personal.applications}
          now={now}
        />
      )}
      {feedbackOpen && (
        <FeedbackDialog
          mode={mode}
          close={() => setFeedbackOpen(false)}
          onSent={() => notify("피드백을 보냈어요. 고마워요.")}
        />
      )}
    </AppShell>
  );
}

export function Workspace(props: Props) {
  const [theme, setTheme] = useState<ThemeMode>(props.initialTheme);
  return (
    <Theme theme={neutralTheme} mode={theme}>
      <ToastViewport position="topEnd" maxVisible={3}>
        <LayoutProvider initialNarrow={false}>
          <WorkspaceInner {...props} theme={theme} onTheme={setTheme} />
        </LayoutProvider>
      </ToastViewport>
    </Theme>
  );
}
