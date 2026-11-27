"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FEEDBACK_MAX_CHARS } from "@/lib/feedback";
import { Modal } from "./modal";
import type { Mode } from "./use-personal";

type Props = { mode: Mode; close: () => void; onSent: () => void };

/** Anonymous feedback to the operator; it lands on the admin page (/admin), not in anyone's inbox. */
export function FeedbackDialog({ mode, close, onSent }: Props) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Start in the text box with a mouse or trackpad. Not on touch screens, where the keyboard would cover the
  // explanation as soon as the dialog opens. This runs after Modal's own effect calls showModal(), which would
  // otherwise move focus to the close button (React's autoFocus runs before it).
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) textRef.current?.focus();
  }, []);
  const demo = mode === "demo";
  const empty = !message.trim();
  // TextArea shows the count and turns it red past the limit but does not stop typing, so sending is blocked here.
  const tooLong = message.length > FEEDBACK_MAX_CHARS;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (empty || tooLong || demo) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, page: window.location.pathname }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      onSent();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "피드백을 보내지 못했어요.");
      setBusy(false);
    }
  }

  return (
    <Modal close={close} label="피드백 보내기">
      <form className="feedback-form" onSubmit={send}>
        <div className="modal-top">
          <h2>피드백 보내기</h2>
          <IconButton variant="ghost" label="피드백 닫기" icon={<X size={20} />} onClick={close} />
        </div>
        <p className="feedback-note">
          불편한 점, 틀린 정보, 있었으면 하는 기능을 적어 주세요. 익명으로 전달되어 이름이나 이메일은 함께 가지 않아요.
        </p>
        <div className="feedback-field">
          <TextArea
            ref={textRef}
            label="피드백 내용"
            isLabelHidden
            value={message}
            onChange={setMessage}
            maxLength={FEEDBACK_MAX_CHARS}
            rows={6}
            placeholder="예) 마감 임박 공고를 알림으로 받고 싶어요"
            isDisabled={demo || busy}
            width="100%"
          />
        </div>
        {demo && <p className="feedback-note">데모에서는 보낼 수 없어요. 학교 계정으로 로그인하면 보낼 수 있어요.</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="feedback-actions">
          <Button variant="secondary" label="취소" onClick={close} />
          <Button
            type="submit"
            variant="primary"
            label={busy ? "보내는 중…" : "보내기"}
            isLoading={busy}
            isDisabled={empty || tooLong || demo}
          />
        </div>
      </form>
    </Modal>
  );
}
