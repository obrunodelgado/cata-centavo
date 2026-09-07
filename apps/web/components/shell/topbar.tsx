"use client";

import { RANGES, type Range } from "../../lib/series.ts";
import { Button } from "../ui/button.tsx";
import { Seg } from "../ui/seg.tsx";

export type { Range };

type TopbarProps = {
  readonly title: string;
  readonly range: Range;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly syncing: boolean;
  readonly justSynced: boolean;
  readonly onRange: (range: Range) => void;
  readonly onPeriod: (start: string, end: string) => void;
  readonly onSync: () => void;
};

/** The prototype's topbar: title, context window (range presets + custom period), sync, actions. */
export function Topbar({ title, range, periodStart, periodEnd, syncing, justSynced, onRange, onPeriod, onSync }: TopbarProps) {
  const periodActive = periodStart !== "";
  return (
    <header className="topbar">
      <div className="tb-left">
        <h1>{title}</h1>
      </div>
      <div className="tb-actions">
        <Seg
          options={RANGES.map((value) => ({ value, label: value }))}
          value={periodActive ? "" : range}
          onChange={(value) => onRange(value as Range)}
          label="Janela de contexto dos dados"
        />
        <label className="date-seg" data-od-id="periodo-selector" title="Período personalizado">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <input
            type="date"
            value={periodStart}
            aria-label="Data inicial do período"
            title="Data inicial"
            onChange={(event) => onPeriod(event.target.value, periodEnd)}
          />
          <span className="date-sep" aria-hidden="true">–</span>
          <input
            type="date"
            value={periodEnd}
            aria-label="Data final do período (opcional)"
            title="Data final"
            min={periodStart === "" ? undefined : periodStart}
            onChange={(event) => onPeriod(periodStart, event.target.value)}
          />
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
