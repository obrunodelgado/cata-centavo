"use client";

import { Pill } from "../ui/pill.tsx";

/** The overview's unavailable-connections card, shared with the transactions view. */
export function UnavailableNotice({ unavailable }: { readonly unavailable: readonly { readonly kind: string; readonly message: string }[] }) {
  return (
    <div className="card" role="alert" style={{ borderColor: "var(--neg)", background: "var(--neg-soft)" }}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="card-title" style={{ color: "var(--neg)" }}>
            Conexões indisponíveis
          </div>
          <div className="card-sub">Os números acima refletem apenas as conexões saudáveis.</div>
        </div>
        <Pill tone="neg">indisponível</Pill>
      </div>
      <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
        {unavailable.map((failure) => (
          <li key={failure.message} className="card-sub">
            {failure.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
