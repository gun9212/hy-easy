"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { sanitizeFiltersForPostings } from "@/lib/filter-options";
import { isClosingSoon, isOpenPosting, isUnknownRecruitment } from "@/lib/posting-format";
import { filtersFromSearchParams } from "@/lib/posting-query";
import { searchOfFilters, shouldPushHistory, viewOfFilters } from "@/lib/workspace-history";
import { AppSideNav, AppTopNav } from "./app-chrome";
import { CompareDock, type View } from "./chrome";
import { LayoutProvider } from "./layout-context";
import { PostingsView, listTitle } from "./postings-view";
import { useMajor } from "./use-major";
import { useBodySearch } from "./use-body-search";
import { usePostings } from "./use-postings";
import { usePersonal, type Mode } from "./use-personal";
import type { Major } from "@/lib/majors";
import type { ThemeMode } from "@/lib/theme-mode";

// Panels that are not on screen at first load are split out of the list page's initial bundle. The detail and
// comparison chunks are fetched once the browser is idle so the first open does not wait on the network.
const loadDetail = () => import("./posting-detail");
const loadComparison = () => import("./comparison");
const PostingDetail = dynamic(() => import("./posting-detail").then(mod => mod.PostingDetail));
const Comparison = dynamic(() => import("./comparison").then(mod => mod.Comparison));
const Planner = dynamic(() => import("./planner").then(mod => mod.Planner), {
  loading: () => (
    <Text type="supporting" role="status">
      플래너를 불러오는 중…
    </Text>
  ),
});
const FeedbackDialog = dynamic(() => import("./feedback-dialog").then(mod => mod.FeedbackDialog));

function usePreloadPanels(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const preload = () => void Promise.all([loadDetail(), loadComparison()]).catch(() => {});
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 3_000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preload, 1_500);
    return () => window.clearTimeout(id);
  }, [ready]);
}

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
  /** The server's guess from the request (a phone), so the first HTML already has the folded phone layout. */
  initialNarrow: boolean;
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
  initialNarrow,
  theme,
  onTheme,
}: InnerProps) {
  const { postings, ready, lastCheckedAt, error: loadError } = usePostings(mode, initialPostings);
  usePreloadPanels(ready);
  const { personal, toggleFavorite, recordApplication, deleteApplication } = usePersonal(mode, {
    favoriteIds: initialFavorites,
    applications: initialApplications,
  });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const textMatchIds = useBodySearch(mode, filters.q);
  const [compared, setCompared] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const savingRef = useRef(false);
  const showToast = useToast();
  const now = useClock(mode, initialNow);
  const { major, chooseMajor } = useMajor(mode, initialMajor);
  const notify = useCallback(
    (body: string, type: "info" | "error" = "info") =>
      showToast({ body, type, isAutoHide: true, autoHideDuration: type === "error" ? 6_000 : TOAST_MS }),
    [showToast],
  );

  const changeMajor = useCallback(
    async (next: Major | null) => {
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
    },
    [chooseMajor, notify],
  );
  const activeFilters = useMemo(
    () => (ready && postings.length > 0 ? sanitizeFiltersForPostings(filters, postings) : filters),
    [ready, postings, filters],
  );
  // Keep ?open=<id> out of the list/side-nav filter object so opening or closing PostingDetail skips re-rendering
  // the entire postings list behind the modal.
  const listFilters = useMemo(() => {
    if (!activeFilters.open) return activeFilters;
    const { open: _open, ...rest } = activeFilters;
    void _open;
    return rest;
  }, [activeFilters]);
  const view = viewOfFilters(listFilters);
  const prevFiltersRef = useRef<Filters>(initialFilters);
  const poppingRef = useRef(false);
  // Whether the open detail added its own history entry, so closing it can go Back to the list instead of leaving
  // a second copy of the list behind it. A detail opened from a shared link has no such entry.
  const detailPushedRef = useRef(false);

  useEffect(() => {
    const onPop = () => {
      poppingRef.current = true;
      detailPushedRef.current = false;
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
    const nextSearch = searchOfFilters(activeFilters);
    const prev = prevFiltersRef.current;
    prevFiltersRef.current = activeFilters;
    if (nextSearch !== window.location.search) {
      const nextUrl = `${window.location.pathname}${nextSearch}`;
      if (shouldPushHistory(prev, activeFilters)) {
        detailPushedRef.current = !prev.open && Boolean(activeFilters.open);
        window.history.pushState(null, "", nextUrl);
      } else {
        window.history.replaceState(null, "", nextUrl);
      }
    }
  }, [activeFilters]);

  const updateFilters = useCallback((patch: Filters) => {
    setFilters(prev => {
      const { page: _page, ...rest } = prev;
      void _page;
      return { ...rest, ...patch };
    });
  }, []);
  const openDetail = useCallback((id: string) => {
    startTransition(() => {
      setFilters(prev => ({ ...prev, open: id }));
    });
  }, []);
  const closeDetail = useCallback(() => {
    if (detailPushedRef.current) {
      detailPushedRef.current = false;
      window.history.back();
      return;
    }
    setFilters(prev => {
      const { open: _open, ...rest } = prev;
      void _open;
      return rest;
    });
  }, []);
  const resetFilters = useCallback(() => {
    setFilters({});
    setMobileMenu(false);
  }, []);
  const navigate = useCallback((next: View, postingId?: string) => {
    // A side-nav tab starts a fresh view so filters from the previous tab never hide saved postings.
    const saved = next === "saved" ? "true" : next === "planner" ? "planner" : "";
    setMobileMenu(false);
    startTransition(() => {
      setFilters(prev => {
        const base: Filters = {};
        if (saved) base.saved = saved;
        if (next === "planner" && postingId) base.posting = postingId;
        if (prev.sort) base.sort = prev.sort;
        return base;
      });
    });
  }, []);
  const favorite = useCallback(
    async (id: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        await toggleFavorite(id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "저장하지 못했습니다.", "error");
      } finally {
        savingRef.current = false;
      }
    },
    [toggleFavorite, notify],
  );
  async function record(postingId: string, status: Parameters<typeof recordApplication>[1], confirmed: boolean) {
    await recordApplication(postingId, status, confirmed);
    notify("지원 상태를 기록했어요.");
  }
  async function remove(postingId: string) {
    await deleteApplication(postingId);
    notify("지원 기록을 삭제했어요.");
  }
  const compare = useCallback(
    (id: string) => {
      let hitLimit = false;
      setCompared(prev => {
        if (prev.includes(id)) return prev.filter(v => v !== id);
        if (prev.length === MAX_COMPARE) {
          hitLimit = true;
          return prev;
        }
        return [...prev, id];
      });
      if (hitLimit) notify(`공고는 최대 ${MAX_COMPARE}개까지 비교할 수 있어요.`);
    },
    [notify],
  );
  const comparedCount = compared.length;
  const openCompareModal = useCallback(() => {
    if (comparedCount) startTransition(() => setCompareOpen(true));
    else notify("공고의 비교 체크박스를 선택해 주세요.");
  }, [comparedCount, notify]);
  const handleOpenPosting = useCallback((p: Posting) => openDetail(p.id), [openDetail]);
  const handleOpenFromSideNav = useCallback(
    (p: Posting) => {
      openDetail(p.id);
      setMobileMenu(false);
    },
    [openDetail],
  );
  const handleFeedbackFromSideNav = useCallback(() => {
    setFeedbackOpen(true);
    setMobileMenu(false);
  }, []);
  const handleSelectWhen = useCallback(
    (when: "" | "open" | "soon" | "new") => {
      updateFilters({ when, saved: "", role: "", q: "" });
      setMobileMenu(false);
    },
    [updateFilters],
  );
  const handleSelectRole = useCallback((role: string) => {
    setFilters(prev => {
      const { page: _page, ...rest } = prev;
      void _page;
      return { ...rest, role: prev.role === role ? "" : role, when: "", saved: "", q: "" };
    });
    setMobileMenu(false);
  }, []);
  const handleOpenPlanner = useCallback(() => navigate("planner"), [navigate]);
  const handleResetCompare = useCallback(() => setCompared([]), []);
  const handleOpenCompareDock = useCallback(() => startTransition(() => setCompareOpen(true)), []);
  const handleOpenFeedback = useCallback(() => setFeedbackOpen(true), []);
  const mobileNav = useMemo(
    () => ({ isOpen: mobileMenu, onOpenChange: setMobileMenu, defaultIsMobile: initialNarrow }),
    [mobileMenu, initialNarrow],
  );

  const active = useMemo(() => personal.applications.find(a => isBlocking(a.status)), [personal.applications]);
  const stats = useMemo(
    () => ({
      open: postings.filter(p => isOpenPosting(p, now)).length,
      unknown: postings.filter(p => isUnknownRecruitment(p, now)).length,
      closingSoon: postings.filter(p => isClosingSoon(p, now)).length,
      activeCompany: postings.find(p => p.id === active?.postingId)?.company ?? null,
      activeStatus: active?.status ?? null,
      hasActive: Boolean(active),
    }),
    [postings, now, active],
  );
  const lastChecked =
    lastCheckedAt ??
    postings
      .map(p => p.lastCheckedAt)
      .sort()
      .at(-1);
  const selected = compared.map(id => postings.find(p => p.id === id)).filter((p): p is Posting => Boolean(p));
  const detail = activeFilters.open ? (postings.find(p => p.id === activeFilters.open) ?? null) : null;
  const heading = HEADINGS[view];

  return (
    <AppShell
      topNav={<AppTopNav mode={mode} userLabel={userLabel} theme={theme} onTheme={onTheme} onHome={resetFilters} />}
      sideNav={
        <AppSideNav
          view={view}
          filters={listFilters}
          postings={postings}
          openCount={stats.open}
          favoriteCount={personal.favoriteIds.length}
          hasActive={stats.hasActive}
          isAdmin={isAdmin}
          navigate={navigate}
          now={now}
          onOpen={handleOpenFromSideNav}
          onFeedback={handleFeedbackFromSideNav}
          selectWhen={handleSelectWhen}
          selectRole={handleSelectRole}
        />
      }
      mobileNav={mobileNav}
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
            <Heading level={1}>{view === "planner" ? heading.title : listTitle(listFilters)}</Heading>
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
            initialPostingId={listFilters.posting ?? null}
          />
        ) : (
          <PostingsView
            postings={postings}
            textMatchIds={textMatchIds}
            filters={listFilters}
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
            onOpenCompare={openCompareModal}
            onOpen={handleOpenPosting}
            onFavorite={favorite}
            onPlanner={handleOpenPlanner}
          />
        )}
        <HStack gap={3} wrap="wrap" align="center">
          <Text type="supporting">HY-Easy · 한양인의 더 나은 선택</Text>
          <Text type="supporting">한양대학교 비공식 서비스</Text>
          <Button variant="ghost" size="sm" label="개인정보처리방침" href="/privacy" as={Link} />
          <Button variant="ghost" size="sm" label="피드백 보내기" onClick={handleOpenFeedback} />
        </HStack>
      </VStack>
      <CompareDock selected={selected} onRemove={compare} onReset={handleResetCompare} onOpen={handleOpenCompareDock} />
      {detail && (
        <PostingDetail
          posting={detail}
          major={major}
          applications={personal.applications}
          now={now}
          saved={personal.favoriteIds.includes(detail.id)}
          onFavorite={() => favorite(detail.id)}
          close={closeDetail}
          onPlan={() => {
            detailPushedRef.current = false;
            navigate("planner", detail.id);
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
        <LayoutProvider initialNarrow={props.initialNarrow}>
          <WorkspaceInner {...props} theme={theme} onTheme={setTheme} />
        </LayoutProvider>
      </ToastViewport>
    </Theme>
  );
}
