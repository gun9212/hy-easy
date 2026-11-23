"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/domain";

export type FeedbackItem = {
  id: string;
  message: string;
  page: string | null;
  created_at: string;
  read_at: string | null;
};

/** Anonymous student feedback, newest first. Unread rows are marked and can be marked read one by one or all at once. */
export function FeedbackList({ items, unread }: { items: FeedbackItem[]; unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");

  async function markRead(id?: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
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

  if (!items.length) return <p className="admin-empty">받은 피드백이 없습니다.</p>;
  return (
    <>
      {unread > 0 && (
        <span className="retry-action">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => markRead()}>
            모두 읽음으로 표시
          </button>
          <span role="status">{message}</span>
        </span>
      )}
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
              <button type="button" className="text-link" disabled={busy} onClick={() => markRead(item.id)}>
                읽음으로 표시
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
