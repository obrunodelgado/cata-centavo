"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";

import { fetchSources, postSync } from "../lib/api.ts";
import type { SourcesResponse } from "../lib/contracts.ts";
import { ObModal } from "../components/shell/ob-modal.tsx";
import { Sidebar } from "../components/shell/sidebar.tsx";
import { Topbar, type Range } from "../components/shell/topbar.tsx";
import { Toast } from "../components/ui/toast.tsx";
import { AnalysisView } from "../components/views/analysis.tsx";
import { BudgetsView } from "../components/views/budgets.tsx";
import { CardsView } from "../components/views/cards.tsx";
import { OverviewView } from "../components/views/overview.tsx";
import { isViewId, TITLES, type ViewId } from "../components/views/registry.ts";
import { TransactionsView } from "../components/views/transactions.tsx";

const VIEWS_BY_ID: Readonly<Record<ViewId, () => JSX.Element>> = {
  "visao-geral": OverviewView,
  transacoes: TransactionsView,
  analises: AnalysisView,
  orcamentos: BudgetsView,
  cartoes: CardsView,
};

function stored(key: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  return window.localStorage.getItem(key) ?? fallback;
}

/** The single-page dashboard shell: sidebar, topbar, one active view, modals. */
export default function Page() {
  const [view, setView] = useState<ViewId>(() => {
    const saved = stored("fluxo.tab", "visao-geral");
    return isViewId(saved) ? saved : "visao-geral";
  });
  const [range, setRange] = useState<Range>(() => (stored("fluxo.range", "6M") as Range));
  const [anchor, setAnchor] = useState<string>(() => stored("fluxo.anchor", today()));
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [banksOpen, setBanksOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSources().then((response) => {
      if (!cancelled) {
        setSources(response);
      }
    }).catch(() => {
      if (!cancelled) {
        setSources({ ok: false, problems: ["Não foi possível consultar as conexões."] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const navigate = useCallback((next: ViewId) => {
    setView(next);
    window.localStorage.setItem("fluxo.tab", next);
  }, []);

  const changeRange = useCallback((next: Range) => {
    setRange(next);
    window.localStorage.setItem("fluxo.range", next);
  }, []);

  const changeAnchor = useCallback((next: string) => {
    setAnchor(next);
    window.localStorage.setItem("fluxo.anchor", next);
  }, []);

  const sync = useCallback(async () => {
    if (syncing) {
      return;
    }
    setSyncing(true);
    try {
      const response = await postSync();
      if (response.ok) {
        const total = response.outcomes.reduce((sum, outcome) => sum + outcome.accounts, 0);
        setJustSynced(true);
        window.setTimeout(() => setJustSynced(false), 5000);
        showToast(`Sincronização concluída · ${total} conta(s)`);
      } else {
        showToast(`Configuração pendente: ${response.problems.length} problema(s).`);
      }
    } catch (error) {
      showToast(`Falha na sincronização: ${errorMessage(error)}`);
    } finally {
      setSyncing(false);
    }
  }, [syncing, showToast]);

  const ActiveView = VIEWS_BY_ID[view] ?? OverviewView;

  return (
    <div className="app">
      <Sidebar view={view} onNavigate={navigate} sources={sources} onManageBanks={() => setBanksOpen(true)} />
      <div className="main">
        <Topbar title={TITLES[view]} range={range} anchor={anchor} syncing={syncing} justSynced={justSynced} onRange={changeRange} onAnchor={changeAnchor} onSync={() => { void sync(); }} />
        <main className="content">
          <ActiveView />
        </main>
      </div>
      <ObModal open={banksOpen} onClose={() => setBanksOpen(false)} sources={sources} />
      <Toast message={toast} />
    </div>
  );
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
