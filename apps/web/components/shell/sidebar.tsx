"use client";

import type { ReactNode } from "react";

import type { SourcesResponse } from "../../lib/contracts.ts";
import { Button } from "../ui/button.tsx";
import { VIEWS, type ViewId } from "../views/registry.ts";

const NAV_ICONS: Readonly<Record<ViewId, ReactNode>> = {
  "visao-geral": (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </>
  ),
  transacoes: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="20" cy="18" r="2" />
    </>
  ),
  analises: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  orcamentos: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 3.5V7M12 17v3.5" />
    </>
  ),
  cartoes: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
};

type SidebarProps = {
  readonly view: ViewId;
  readonly onNavigate: (view: ViewId) => void;
  readonly sources: SourcesResponse | null;
  readonly onManageBanks: () => void;
};

export function Sidebar({ view, onNavigate, sources, onManageBanks }: SidebarProps) {
  return (
    <aside className="side" aria-label="Navegação principal">
      <div className="side-brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 14.5h4.5M3 10h9M3 5.5h5.5" />
            <path d="M12.5 4.5l3 2.8-3 2.8" />
          </svg>
        </span>
        Fluxo
      </div>

      <nav className="side-nav">
        <p className="side-label">Painel</p>
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === view ? "nav-item active" : "nav-item"}
            aria-current={item.id === view ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              {NAV_ICONS[item.id]}
            </svg>
            {item.title}
          </button>
        ))}
      </nav>

      <div className="side-foot">
        <OpenBankingCard sources={sources} onManageBanks={onManageBanks} />
      </div>
    </aside>
  );
}

function OpenBankingCard({ sources, onManageBanks }: { readonly sources: SourcesResponse | null; readonly onManageBanks: () => void }) {
  let body;
  if (sources === null) {
    body = (
      <div className="ob-list">
        <div className="ob-row">Conectando…</div>
      </div>
    );
  } else if (!sources.ok) {
    body = (
      <div className="ob-list">
        <div className="ob-row"><b>Configuração pendente</b></div>
        <div className="ob-row">{sources.problems.length} problema(s) detectado(s)</div>
      </div>
    );
  } else {
    const names = sources.sources.map((source) => source.institution);
    body = (
      <div className="ob-list">
        <div className="ob-row"><b>{sources.sources.length}</b> bancos conectados</div>
        <div className="ob-row"><span className="ok">●</span> {names.length > 0 ? names.join(" · ") : "Nenhum banco conectado"}</div>
      </div>
    );
  }

  return (
    <div className="ob-card">
      <div className="ob-title"><span className="dot"></span> Open Banking</div>
      {body}
      <Button variant="secondary" onClick={onManageBanks} style={{ width: "100%", justifyContent: "center", fontSize: "12.5px" }}>
        Gerenciar bancos
      </Button>
    </div>
  );
}
