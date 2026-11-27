"use client";

// The compare dock and the workspace's view names. The old top bar and sidebar that lived here gave way to Astryx's
// AppShell in app-chrome.tsx.
import { ArrowRight, GitCompareArrows, X } from "lucide-react";
import type { Posting } from "@/lib/domain";

export type View = "postings" | "planner" | "saved";

type DockProps = { selected: Posting[]; onRemove: (id: string) => void; onReset: () => void; onOpen: () => void };

export function CompareDock({ selected, onRemove, onReset, onOpen }: DockProps) {
  if (!selected.length) return null;
  return (
    <div className="compare-dock">
      <GitCompareArrows size={20} />
      <b>
        {selected.length}개<span className="dock-wide"> 공고 선택</span>
      </b>
      {/* Compact screens hide the removable chips below; the names still say which postings are picked. */}
      <span className="dock-names">{selected.map(p => p.company).join(" · ")}</span>
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
