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

const VIEWS_BY_ID: Readonly<Record<Exclude<ViewId, "visao-geral">, () => JSX.Element>> = {
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
  // Hydration-safe localStorage state: the initializers stay at the fallbacks
  // so the server render and the first client render agree, and the stored
  // values land in an effect — a lazy initializer would mismatch the SSR HTML
  // on reload, and React refuses to patch up attribute differences (the Seg's
  // and sidebar's active classes and aria-* would stay stuck on the server's
  // values).
  const [view, setView] = useState<ViewId>("visao-geral");
  const [range, setRange] = useState<Range>("6M");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");

  useEffect(() => {
    const savedView = stored("fluxo.tab", "visao-geral");
    setView(isViewId(savedView) ? savedView : "visao-geral");
    setRange(stored("fluxo.range", "6M") as Range);
    setPeriodStart(stored("fluxo.rangeStart", ""));
    setPeriodEnd(stored("fluxo.rangeEnd", ""));
  }, []);
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [banksOpen, setBanksOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** Bumped after each completed sync; the overview view refetches on change. */
  const [refreshKey, setRefreshKey] = useState(0);
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
    // A preset overrides the custom period: the prototype clears both inputs.
    setPeriodStart("");
    setPeriodEnd("");
    window.localStorage.removeItem("fluxo.rangeStart");
    window.localStorage.removeItem("fluxo.rangeEnd");
  }, []);

  const changePeriod = useCallback((start: string, end: string) => {
    setPeriodStart(start);
    setPeriodEnd(end);
    window.localStorage.setItem("fluxo.rangeStart", start);
    window.localStorage.setItem("fluxo.rangeEnd", end);
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
        setRefreshKey((key) => key + 1);
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

  const ActiveView = view === "visao-geral" ? null : VIEWS_BY_ID[view];

  return (
    <div className="app">
      <Sidebar view={view} onNavigate={navigate} sources={sources} onManageBanks={() => setBanksOpen(true)} />
      <div className="main">
        <Topbar title={TITLES[view]} range={range} periodStart={periodStart} periodEnd={periodEnd} syncing={syncing} justSynced={justSynced} onRange={changeRange} onPeriod={changePeriod} onSync={() => { void sync(); }} />
        <main className="content">
          {ActiveView === null ? (
            <OverviewView range={range} periodStart={periodStart} periodEnd={periodEnd} refreshKey={refreshKey} />
          ) : (
            <ActiveView />
          )}
        </main>
      </div>
      <ObModal open={banksOpen} onClose={() => setBanksOpen(false)} sources={sources} />
      <Toast message={toast} />
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
