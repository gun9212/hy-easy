"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Resets queue retries so the next collector run classifies again. Without postingId: every exhausted posting.
export function RetryButton({ postingId, label }: { postingId?: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function retry() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/queue/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postingId ? { postingId } : {}),
      });
      const data = (await response.json().catch(() => null)) as { reset?: number; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "재시도를 요청하지 못했습니다.");
      setMessage(data?.reset ? `${data.reset}건을 다음 수집 때 다시 분류합니다.` : "다시 분류할 공고가 없습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "재시도를 요청하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="retry-action">
      <button type="button" className="secondary-button" disabled={busy} onClick={retry}>
        {busy ? "요청 중…" : label}
      </button>
      <span role="status">{message}</span>
    </span>
  );
}
