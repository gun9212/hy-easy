"use client";

// Page chrome around the workspace: top bar, sidebar navigation and the compare dock.
import Image from "next/image";
import Link from "next/link";
import { clearStoredPostings } from "./posting-store";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarClock,
  GitCompareArrows,
  LayoutList,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import { ROLES, filterPostings, type Filters, type Posting } from "@/lib/domain";
import type { Mode } from "./use-personal";

export type View = "postings" | "planner" | "saved";

export function TopBar({ mode, userLabel, onMenu }: { mode: Mode; userLabel: string; onMenu: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button mobile-only" aria-label="메뉴 열기" onClick={onMenu}>
          <Menu size={20} />
        </button>
        <Link href={mode === "demo" ? "/demo" : "/postings"} className="brand">
          <Image
            className="brand-symbol"
            src="/brand/hy-easy-mark.svg"
            alt=""
            width={34}
            height={34}
            unoptimized
            priority
          />
          <span className="brand-name">HY-Easy</span>
        </Link>
        <span className="topbar-subtitle">한양인의 현장실습 탐색</span>
      </div>
      <div className="topbar-actions">
        <a className="hywep-link" href="https://hywep.hanyang.ac.kr/" target="_blank" rel="noreferrer">
          HY-WEP <ArrowUpRight size={14} />
        </a>
        <span className="user-avatar">{mode === "demo" ? "H" : userLabel.slice(0, 1).toUpperCase()}</span>
        <span className="user-name">{userLabel}</span>
        {mode === "live" && (
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
            <button className="icon-button" aria-label="로그아웃">
              <LogOut size={17} />
            </button>
          </form>
        )}
      </div>
    </header>
  );
}

type SidebarProps = {
  open: boolean;
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

export function Sidebar(props: SidebarProps) {
  const { open, view, filters, postings, navigate } = props;
  // Same rule as the list: primary or secondary role, closed postings only when the list shows them.
  const roleCount = (role: string) => filterPostings(postings, { role }).length;
  return (
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar-section-label">메뉴</div>
      <nav aria-label="주 메뉴">
        <button className={view === "postings" ? "nav-item active" : "nav-item"} onClick={() => navigate("postings")}>
          <LayoutList size={18} />
          실습 공고 <span className="nav-count">{props.openCount}</span>
        </button>
        <button className={view === "saved" ? "nav-item active" : "nav-item"} onClick={() => navigate("saved")}>
          <Bookmark size={18} />
          관심 공고 <span className="nav-count plain">{props.favoriteCount}</span>
        </button>
        <button className={view === "planner" ? "nav-item active" : "nav-item"} onClick={() => navigate("planner")}>
          <CalendarClock size={18} />
          지원 플래너 {props.hasActive && <span className="nav-count plain">진행 중</span>}
        </button>
        {props.isAdmin && (
          <Link className="nav-item" href="/admin">
            <ShieldCheck size={18} />
            관리자
          </Link>
        )}
      </nav>
      <div className="sidebar-rule" />
      <div className="sidebar-section-label">
        직군으로 탐색<span>{ROLES.length}</span>
      </div>
      <nav className="role-nav" aria-label="직군 필터">
        {ROLES.map(role => (
          <button
            key={role}
            className={`role-nav-item ${filters.role === role ? "selected" : ""}`}
            onClick={() => props.selectRole(role)}
          >
            {role}
            <span>{roleCount(role)}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <p>
          나에게 맞는 경험을 찾는 과정,
          <br />
          HY-Easy가 함께합니다.
        </p>
        <a href="https://intern.hanyang.ac.kr/boards/205/view" target="_blank" rel="noreferrer">
          현장실습 지원 안내 <ArrowUpRight size={13} />
        </a>
      </div>
    </aside>
  );
}

type DockProps = { selected: Posting[]; onRemove: (id: string) => void; onReset: () => void; onOpen: () => void };

export function CompareDock({ selected, onRemove, onReset, onOpen }: DockProps) {
  if (!selected.length) return null;
  return (
    <div className="compare-dock">
      <GitCompareArrows size={20} />
      <b>{selected.length}개 공고 선택</b>
      <div className="dock-companies">
        {selected.map(p => (
          <span key={p.id}>
            {p.company}
            <button aria-label={`${p.company} 비교 해제`} onClick={() => onRemove(p.id)}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <button className="dock-reset" onClick={onReset}>
        초기화
      </button>
      <button className="primary-button" onClick={onOpen}>
        <span className="dock-wide">나란히 </span>비교하기 <ArrowRight size={15} />
      </button>
    </div>
  );
}
