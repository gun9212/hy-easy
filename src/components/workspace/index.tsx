"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { eligibility, formatDate, isBlocking, type Application, type Filters, type Posting } from "@/lib/domain";
import { isClosingSoon } from "@/lib/posting-format";
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

function viewOf(filters: Filters): View {
  if (filters.saved === "planner") return "planner";
  return filters.saved === "true" ? "saved" : "postings";
}

function writeUrl(filters: Filters): void {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
}

function useClock(mode: Mode, initialNow: string): Date {
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    if (mode === "demo") return;
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [mode]);
  return now;
}

function useToast(): [string, (message: string) => void] {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);
  return [toast, setToast];
}

/** The demo's one line under the title: what the list is, and when the collector last checked it. */
function sourceLine(mode: Mode, lastChecked: string | undefined): string {
  if (mode === "demo") return "한양대학교 HY-WEP 현장실습 공고 · 가상 데이터";
  const checked = lastChecked ? `${formatDate(lastChecked, true)} 확인` : "첫 수집 대기";
  return `한양대학교 HY-WEP 현장실습 공고 · ${checked} · 평일 09–18시 10분 간격 수집`;
}

export function Workspace({
  mode,
  postings: initialPostings,
  initialFavorites,
  initialApplications,
  initialFilters,
  initialNow,
  initialMajor,
  userLabel,
  isAdmin,
  initialTheme,
}: Props) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const { postings, ready, lastCheckedAt, error: loadError } = usePostings(mode, initialPostings);
  const { personal, toggleFavorite, recordApplication, deleteApplication } = usePersonal(mode, {
    favoriteIds: initialFavorites,
    applications: initialApplications,
  });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [compared, setCompared] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [detail, setDetail] = useState<Posting | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useToast();
  const now = useClock(mode, initialNow);
  const { major, chooseMajor } = useMajor(mode, initialMajor);
  async function changeMajor(next: Major | null) {
    try {
      await chooseMajor(next);
      if (!next && (filters.mine || filters.others)) updateFilters({ mine: "", others: "" });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "전공을 저장하지 못했습니다.");
    }
  }
  const view = viewOf(filters);

  useEffect(() => {
    const onPop = () => setFilters(Object.fromEntries(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function updateFilters(patch: Filters) {
    const { page: _page, ...rest } = filters;
    void _page;
    const next = { ...rest, ...patch };
    setFilters(next);
    writeUrl(next);
  }
  function resetFilters() {
    setFilters({});
    writeUrl({});
  }
  function navigate(next: View) {
    // A side-nav tab starts a fresh search: the text typed on the previous tab would hide this tab's postings.
    updateFilters({ saved: next === "saved" ? "true" : next === "planner" ? "planner" : "", when: "", q: "" });
    setMobileMenu(false);
  }
  async function favorite(id: string) {
    if (saving) return;
    setSaving(true);
    try {
      await toggleFavorite(id);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function record(postingId: string, status: Parameters<typeof recordApplication>[1], confirmed: boolean) {
    await recordApplication(postingId, status, confirmed);
    setToast("지원 상태를 기록했어요.");
  }
  async function remove(postingId: string) {
    await deleteApplication(postingId);
    setToast("지원 기록을 삭제했어요.");
  }
  function compare(id: string) {
    if (compared.includes(id)) setCompared(compared.filter(v => v !== id));
    else if (compared.length === MAX_COMPARE) setToast(`공고는 최대 ${MAX_COMPARE}개까지 비교할 수 있어요.`);
    else setCompared([...compared, id]);
  }

  const active = personal.applications.find(a => isBlocking(a.status));
  const stats = {
    open: postings.filter(p => eligibility(p, [], now).status !== "closed").length,
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
  const selected = postings.filter(p => compared.includes(p.id));
  const heading = HEADINGS[view];

  return (
    <Theme theme={neutralTheme} mode={theme}>
      <LayoutProvider initialNarrow={false}>
        <AppShell
          topNav={<AppTopNav mode={mode} userLabel={userLabel} theme={theme} onTheme={setTheme} />}
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
              onOpen={setDetail}
              onFeedback={() => {
                setFeedbackOpen(true);
                setMobileMenu(false);
              }}
              selectWhen={when => {
                updateFilters({ when, saved: "", role: "", q: "" });
                setMobileMenu(false);
              }}
              selectRole={role => {
                updateFilters({ role: filters.role === role ? "" : role, saved: "", q: "" });
                setMobileMenu(false);
              }}
            />
          }
          mobileNav={{ isOpen: mobileMenu, onOpenChange: setMobileMenu }}
          contentPadding={5}
        >
          <VStack gap={4}>
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
                  compared.length ? setCompareOpen(true) : setToast("공고의 비교 체크박스를 선택해 주세요.")
                }
                onOpen={setDetail}
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
              close={() => setDetail(null)}
              onPlan={() => {
                setDetail(null);
                navigate("planner");
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
              onSent={() => setToast("피드백을 보냈어요. 고마워요.")}
            />
          )}
          {toast && (
            <div className="toast" role="status">
              <Info size={16} />
              {toast}
              <button aria-label="알림 닫기" onClick={() => setToast("")}>
                <X size={15} />
              </button>
            </div>
          )}
        </AppShell>
      </LayoutProvider>
    </Theme>
  );
}
