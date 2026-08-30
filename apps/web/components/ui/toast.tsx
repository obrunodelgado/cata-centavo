"use client";

/** The prototype's toast, bottom-right; parent controls visibility and timeout. */
export function Toast({ message }: { readonly message: string | null }) {
  return (
    <div className={message === null ? "toast" : "toast show"} role="status" aria-live="polite">
      {message}
    </div>
  );
}
