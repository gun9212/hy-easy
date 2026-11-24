"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = { children: ReactNode; close: () => void; label: string; wide?: boolean };

/**
 * Native <dialog> modal: Escape and backdrop click close it; page scroll is locked while open; closing puts focus
 * back on the control that opened it.
 */
export function Modal({ children, close, label, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    // The browser's own focus return does not run here: React has already removed the dialog when this cleanup
    // closes it, so focus would fall to <body>. Remember the opener and return to it ourselves.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog?.close();
      // Skip an opener that is gone or hidden (e.g. a link inside the mobile menu, which closes as the modal opens).
      if (opener?.isConnected && opener.getClientRects().length > 0) opener.focus({ preventScroll: true });
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
