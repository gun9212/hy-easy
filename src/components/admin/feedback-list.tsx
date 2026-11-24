"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/domain";
import type { FeedbackFilter } from "@/lib/feedback";

export type FeedbackItem = {
  id: string;
  message: string;
  page: string | null;
  created_at: string;
  read_at: string | null;
};

type Props = {
  items: FeedbackItem[];
  unread: number;
  total: number;
  allTotal: number;
  page: number;
  pageSize: number;
  filter: FeedbackFilter;
};

function feedbackHref(filter: FeedbackFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter === "unread") params.set("feedback", "unread");
  if (page > 1) params.set("feedbackPage", String(page));
  const query = params.toString();
  return query ? `/admin?${query}#feedback` : "/admin#feedback";
}

/** Anonymous student feedback, newest first, with unread filter, pagination, and explicit bulk-read scope. */
export function FeedbackList({ items, unread, total, allTotal, page, pageSize, filter }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");

  async function markRead(payload: { id?: string; ids?: string[] } = {}) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "읽음 처리하지 못했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "읽음 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const shownUnreadIds = items.filter(item => !item.read_at).map(item => item.id);
  const hasUnreadBeyondPage = unread > shownUnreadIds.length;

  return (
    <>
      <div className="feedback-controls">
        <nav className="feedback-tabs" aria-label="피드백 필터">
          <Link
            href={feedbackHref("all", 1)}
            className="feedback-tab"
            aria-current={filter === "all" ? "page" : undefined}
          >
            전체 ({allTotal})
          </Link>
          <Link
            href={feedbackHref("unread", 1)}
            className="feedback-tab"
            aria-current={filter === "unread" ? "page" : undefined}
          >
            미열람 ({unread})
          </Link>
        </nav>
        {unread > 0 && (
          <div className="retry-action">
            {hasUnreadBeyondPage && shownUnreadIds.length > 0 && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => markRead({ ids: shownUnreadIds })}
              >
                현재 페이지 미열람 {shownUnreadIds.length}건만 읽음
              </button>
            )}
            <button type="button" className="secondary-button" disabled={busy} onClick={() => markRead({})}>
              {hasUnreadBeyondPage
                ? `전체 미열람 ${unread}건 모두 읽음으로 표시 (다른 페이지 포함)`
                : `전체 미열람 ${unread}건 모두 읽음으로 표시`}
            </button>
            <span role="status">{message}</span>
          </div>
        )}
      </div>
      {!items.length ? (
        <p className="admin-empty">
          {filter === "unread"
            ? "미열람 피드백이 없습니다."
            : page > 1
              ? "이 페이지에 표시할 피드백이 없습니다."
              : "받은 피드백이 없습니다."}
        </p>
      ) : (
        <ul className="feedback-list">
          {items.map(item => (
            <li key={item.id} data-unread={item.read_at ? undefined : ""}>
              <p className="feedback-meta">
                {!item.read_at && <b>새 피드백</b>}
                <span>{formatDate(item.created_at, true)}</span>
                {item.page && <span>{item.page}</span>}
              </p>
              <p className="feedback-message">{item.message}</p>
              {!item.read_at && (
                <button type="button" className="text-link" disabled={busy} onClick={() => markRead({ id: item.id })}>
                  읽음으로 표시
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(totalPages > 1 || page > 1) && (
        <nav className="feedback-pagination" aria-label="피드백 페이지 이동">
          {page > 1 ? (
            <Link className="secondary-button" href={feedbackHref(filter, page - 1)}>
              이전
            </Link>
          ) : (
            <span className="feedback-page-disabled">이전</span>
          )}
          <span className="feedback-page-status">
            {page} / {totalPages}페이지 (총 {total}건)
          </span>
          {page < totalPages ? (
            <Link className="secondary-button" href={feedbackHref(filter, page + 1)}>
              다음
            </Link>
          ) : (
            <span className="feedback-page-disabled">다음</span>
          )}
        </nav>
      )}
    </>
  );
}
