/**
 * The hint that a transaction carries the user's note. Rendered beside the
 * category on every transaction list — the full text rides on the row, so the
 * native tooltip needs no extra fetch. Focusable so keyboard users reach the
 * label too; the note itself is always editable in the detail modal.
 */
export function NoteChip({ note }: { readonly note: string }) {
  return (
    <span className="tx-note" title={note} aria-label={"Tem nota: " + note} role="img" tabIndex={0}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h9" />
      </svg>
    </span>
  );
}
