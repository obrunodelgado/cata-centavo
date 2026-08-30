"use client";

import { Button } from "../ui/button.tsx";
import { Seg } from "../ui/seg.tsx";

const RANGES = [
  { value: "1D", label: "1D" },
  { value: "1S", label: "1S" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "12M", label: "12M" },
] as const;

export type Range = (typeof RANGES)[number]["value"];

type TopbarProps = {
  readonly title: string;
  readonly range: Range;
  readonly anchor: string;
  readonly syncing: boolean;
  readonly justSynced: boolean;
  readonly onRange: (range: Range) => void;
  readonly onAnchor: (anchor: string) => void;
  readonly onSync: () => void;
};

/** The prototype's topbar: title, context window (range + anchor day), sync, actions. */
export function Topbar({ title, range, anchor, syncing, justSynced, onRange, onAnchor, onSync }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="tb-left">
        <h1>{title}</h1>
      </div>
      <div className="tb-actions">
        <Seg
          options={RANGES}
          value={range}
          onChange={(value) => onRange(value as Range)}
          label="Janela de contexto dos dados"
        />
        <label className="date-seg" title="Período ou dia de referência">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <input type="date" value={anchor} aria-label="Período ou dia de referência" onChange={(event) => onAnchor(event.target.value)} />
        </label>
        <Button variant="secondary" onClick={onSync} disabled={syncing}>
          <span className="dot"></span>
          {syncing ? "Sincronizando…" : justSynced ? "Sincronizado agora" : "Sincronizar"}
        </Button>
        <Button variant="primary" disabled title="Disponível em breve">
          + Nova transação
        </Button>
        <div className="avatar" aria-hidden="true">BM</div>
      </div>
    </header>
  );
}
