"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, Info, X } from "lucide-react";
import {
  eligibility,
  formatDate,
  isBlocking,
  remainingDays,
  type Application,
  type Filters,
  type Posting,
} from "@/lib/domain";
import { Comparison } from "./comparison";
import { CompareDock, Sidebar, TopBar, type View } from "./chrome";
import { Planner } from "./planner";
import { PostingDetail } from "./posting-detail";
import { PostingsView } from "./postings-view";
import { usePersonal, type Mode } from "./use-personal";

type Props = {
  mode: Mode;
  postings: Posting[];
  initialFavorites: string[];
  initialApplications: Application[];
  initialFilters: Filters;
  initialNow: string;
  userLabel: string;
  isAdmin: boolean;
};

const MAX_COMPARE = 4;
const CLOCK_TICK_MS = 30_000;
const TOAST_MS = 4_200;
const HEADINGS: Record<View, { eyebrow: string; title: string; text: string }> = {
  postings: {
    eyebrow: "EXPLORE OPPORTUNITIES",
    title: "실습 공고",
    text: "어떤 일을 하는지부터 언제 지원할지까지, 나에게 맞는 기회를 찾아보세요.",
  },
  saved: {
    eyebrow: "EXPLORE OPPORTUNITIES",
    title: "관심 공고",
    text: "저장해 둔 공고를 같은 기준으로 비교해 보세요.",
  },
  planner: {
    eyebrow: "MY APPLICATIONS",
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

function SyncState({ mode, lastChecked }: { mode: Mode; lastChecked: string | undefined }) {
  return (
    <div className="sync-state">
      <span className={mode === "demo" ? "gray-dot" : "blue-dot"} />
      {mode === "demo" ? "가상 데이터" : lastChecked ? `${formatDate(lastChecked, true)} 확인` : "첫 수집 대기"}
      <span className="sync-caption">
        {mode === "demo" ? "실제 모집 정보가 아닙니다" : "평일 09–18시 · 5분 간격 수집"}
      </span>
    </div>
  );
}

export function Workspace({
  mode,
  postings,
  initialFavorites,
  initialApplications,
  initialFilters,
  initialNow,
  userLabel,
  isAdmin,
}: Props) {
  const { personal, toggleFavorite, recordApplication } = usePersonal(mode, {
    favoriteIds: initialFavorites,
    applications: initialApplications,
  });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [compared, setCompared] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [detail, setDetail] = useState<Posting | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useToast();
  const now = useClock(mode, initialNow);
  const view = viewOf(filters);

  useEffect(() => {
    const onPop = () => setFilters(Object.fromEntries(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function updateFilters(patch: Filters) {
    const next = { ...filters, page: "1", ...patch };
    setFilters(next);
    writeUrl(next);
  }
  function resetFilters() {
    setFilters({});
    writeUrl({});
  }
  function navigate(next: View) {
    updateFilters({ saved: next === "saved" ? "true" : next === "planner" ? "planner" : "" });
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
  function compare(id: string) {
    if (compared.includes(id)) setCompared(compared.filter(v => v !== id));
    else if (compared.length === MAX_COMPARE) setToast(`공고는 최대 ${MAX_COMPARE}개까지 비교할 수 있어요.`);
    else setCompared([...compared, id]);
  }

  const active = personal.applications.find(a => isBlocking(a.status));
  const stats = {
    open: postings.filter(p => eligibility(p, [], now).status !== "closed").length,
    closingSoon: postings.filter(p => {
      const days = remainingDays(p, now);
      return days !== null && days >= 0 && days <= 3 && p.recruitment !== "closed";
    }).length,
    activeCompany: postings.find(p => p.id === active?.postingId)?.company ?? null,
    hasActive: Boolean(active),
  };
  const lastChecked = postings
    .map(p => p.lastCheckedAt)
    .sort()
    .at(-1);
  const selected = postings.filter(p => compared.includes(p.id));
  const heading = HEADINGS[view];

  return (
    <div className="app-shell">
      <TopBar mode={mode} userLabel={userLabel} onMenu={() => setMobileMenu(!mobileMenu)} />
      <Sidebar
        open={mobileMenu}
        view={view}
        filters={filters}
        postings={postings}
        openCount={stats.open}
        favoriteCount={personal.favoriteIds.length}
        hasActive={stats.hasActive}
        isAdmin={isAdmin}
        navigate={navigate}
        selectRole={role => {
          updateFilters({ role: filters.role === role ? "" : role, saved: "" });
          setMobileMenu(false);
        }}
      />
      <main className="workspace-main">
        {mode === "demo" && (
          <div className="demo-notice">
            <span>
              <Info size={14} />
              <b>데모 워크스페이스</b>
              <span>가상 기업·공고입니다. 일정 기준: 2026.11.10 13:00</span>
            </span>
            <Link href="/login">
              로그인 안내 <ArrowRight size={13} />
            </Link>
          </div>
        )}
        <div className="page-heading">
          <div className="breadcrumb">
            워크스페이스 <ChevronRight size={12} /> {heading.title}
          </div>
          <div className="heading-row">
            <div>
              <div className="heading-eyebrow">{heading.eyebrow}</div>
              <h1>
                {heading.title}
                <span className="heading-dot">.</span>
              </h1>
              <p>{heading.text}</p>
            </div>
            <SyncState mode={mode} lastChecked={lastChecked} />
          </div>
        </div>
        {view === "planner" ? (
          <Planner postings={postings} applications={personal.applications} record={record} now={now} />
        ) : (
          <PostingsView
            postings={postings}
            filters={filters}
            updateFilters={updateFilters}
            resetFilters={resetFilters}
            favoriteIds={personal.favoriteIds}
            applications={personal.applications}
            compared={compared}
            now={now}
            stats={stats}
            onCompare={compare}
            onOpenCompare={() =>
              compared.length ? setCompareOpen(true) : setToast("공고 왼쪽의 체크박스를 선택해 주세요.")
            }
            onOpen={setDetail}
            onFavorite={favorite}
            onPlanner={() => navigate("planner")}
          />
        )}
        <footer className="workspace-footer">
          <span>HY-Easy · 한양인의 더 나은 선택</span>
          <span>한양대학교 비공식 서비스</span>
        </footer>
      </main>
      <CompareDock
        selected={selected}
        onRemove={compare}
        onReset={() => setCompared([])}
        onOpen={() => setCompareOpen(true)}
      />
      {detail && (
        <PostingDetail
          posting={detail}
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
      {toast && (
        <div className="toast" role="status">
          <Info size={17} />
          {toast}
          <button aria-label="알림 닫기" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
