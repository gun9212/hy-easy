"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = { children: ReactNode; close: () => void; label: string; wide?: boolean };

/** Native <dialog> modal: Escape and backdrop click close it; page scroll is locked while open. */
export function Modal({ children, close, label, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={label}
      onCancel={close}
      onClick={event => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="modal-inner">{children}</div>
    </dialog>
  );
}
