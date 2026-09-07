"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type TooltipPlace = {
  readonly left: number;
  readonly top: number;
  readonly below: boolean;
  readonly arrowX: number;
};

/**
 * The hint that a transaction carries the user's note, with the prototype's
 * tooltip: one dark bubble labelled "Nota", flipped above or below the chip
 * depending on the room left in the viewport. It opens on hover and on focus,
 * and hides on scroll, resize and click — the row's own click opens the detail
 * modal, where the note is editable.
 */
export function NoteChip({ note }: { readonly note: string }) {
  const chipRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<TooltipPlace | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const chip = chipRef.current;
    const tip = tipRef.current;
    if (chip === null || tip === null) {
      return;
    }
    setPlace(placeOf(chip, tip));
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const hide = () => setOpen(false);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  return (
    <>
      <span
        ref={chipRef}
        className="tx-note"
        aria-label={"Tem nota: " + note}
        role="img"
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(false)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h9" />
        </svg>
      </span>
      {mounted
        ? createPortal(
            <div
              ref={tipRef}
              className={open && place !== null ? `note-tip on${place.below ? " below" : ""}` : "note-tip"}
              style={place === null ? undefined : ({ left: place.left, top: place.top, "--tip-x": `${place.arrowX}px` }) as CSSProperties}
              role="tooltip"
            >
              <span className="tip-label">Nota</span>
              {note}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * The prototype's placement: centered on the chip, clamped to the viewport,
 * flipped below when there is no room above, with the arrow kept pointing at
 * the chip.
 */
function placeOf(chip: Element, tip: HTMLElement): TooltipPlace {
  const chipBox = chip.getBoundingClientRect();
  const tipBox = tip.getBoundingClientRect();
  const below = chipBox.top - tipBox.height - 12 < 8;
  const left = Math.max(8, Math.min(chipBox.left + chipBox.width / 2 - tipBox.width / 2, window.innerWidth - tipBox.width - 8));
  const top = below ? chipBox.bottom + 9 : chipBox.top - tipBox.height - 9;
  const arrowX = Math.max(12, Math.min(chipBox.left + chipBox.width / 2 - left, tipBox.width - 12));
  return { left, top, below, arrowX };
}
