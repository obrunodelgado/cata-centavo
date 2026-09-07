"use client";

import { useEffect, type ReactNode } from "react";

type ModalProps = {
  readonly title: string;
  readonly sub?: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
};

/** The prototype's modal: backdrop, Escape and click-outside close, focus on first control. */
export function Modal({ title, sub, open, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop open" role="dialog" aria-modal="true" aria-labelledby="modalTitle" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="card-head" style={{ marginBottom: "10px" }}>
          <div>
            <h2 id="modalTitle">{title}</h2>
            {sub !== undefined ? <p className="modal-sub">{sub}</p> : null}
          </div>
          <button type="button" className="btn btn-ghost" aria-label="Fechar" style={{ fontSize: "18px" }} onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
