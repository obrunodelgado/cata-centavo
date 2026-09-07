"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchCategories, fetchTransactions, postTransactionCategory, postTransactionNote, type TransactionsQuery } from "../../lib/api.ts";
import type { BreakdownSlice, CategoryOption, TransactionRow, TransactionsResponse, TransactionTypeFilter } from "../../lib/contracts.ts";
import { clockTimeOf, dayMonthShort } from "../../lib/datetime.ts";
import { categoryColor, categoryName, paymentMethodClass } from "../../lib/labels.ts";
import { centsToBRL, percentBRL } from "../../lib/money.ts";
import type { Range } from "../../lib/series.ts";
import { useApi } from "../../lib/use-api.ts";
import { useDebounce } from "../../lib/use-debounce.ts";
import { Button } from "../ui/button.tsx";
import { Modal } from "../ui/modal.tsx";
import { NoteChip } from "../ui/note-chip.tsx";
import { Seg } from "../ui/seg.tsx";
import { DataTable, type TableColumn } from "../ui/table.tsx";
import { UnavailableNotice } from "../ui/unavailable-notice.tsx";

/**
 * Transações — the prototype's searchable, filterable list fed by
 * `/api/transactions`. The count is the server's `totalInWindow` (never the
 * loaded rows'), the sidebar is the payload's `breakdown`, and "Mostrar mais"
 * appends pages through the opaque `after` token. The detail modal's edits are
 * real: one "Salvar alterações" action persists the category and the note —
 * each only when it changed — patches the row in place and silently refetches
 * the head so the sidebar keeps up; scroll and pagination stay put. A row
 * with a note shows the small hint chip in the list; the native `title` is
 * the v1 tooltip.
 */

const NEXT_PAGES = 100;
const SEARCH_DEBOUNCE = 300;

const TIPO_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "receitas", label: "Receitas" },
  { value: "despesas", label: "Despesas" },
];

type TransactionsViewProps = {
  readonly range: Range;
  readonly periodStart: string;
  readonly periodEnd: string;
  /** Bumped by the shell after a sync so the view refetches. */
  readonly refreshKey: number;
};

export function TransactionsView({ range, periodStart, periodEnd, refreshKey }: TransactionsViewProps) {
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState<TransactionTypeFilter>("todas");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  // Hydration-safe localStorage state: the initializers stay at the defaults
  // so the server render and the first client render agree (page.tsx's rule).
  useEffect(() => {
    setQuery(window.localStorage.getItem("fluxo.tx.q") ?? "");
    const storedType = window.localStorage.getItem("fluxo.tx.type");
    setTipo(storedType === "receitas" || storedType === "despesas" ? storedType : "todas");
    const storedCategory = window.localStorage.getItem("fluxo.tx.category");
    setCategoryId(storedCategory === null || storedCategory === "" ? null : storedCategory);
  }, []);

  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    if (value === "") {
      window.localStorage.removeItem("fluxo.tx.q");
    } else {
      window.localStorage.setItem("fluxo.tx.q", value);
    }
  }, []);
  const changeTipo = useCallback((value: TransactionTypeFilter) => {
    setTipo(value);
    window.localStorage.setItem("fluxo.tx.type", value);
  }, []);
  const changeCategory = useCallback((value: string | null) => {
    setCategoryId(value);
    if (value === null) {
      window.localStorage.removeItem("fluxo.tx.category");
    } else {
      window.localStorage.setItem("fluxo.tx.category", value);
    }
  }, []);

  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE);
  const request = useMemo<TransactionsQuery>(
    () => ({
      range,
      ...(periodStart !== "" ? { from: periodStart, ...(periodEnd !== "" ? { to: periodEnd } : {}) } : {}),
      ...(debouncedQuery !== "" ? { q: debouncedQuery } : {}),
      ...(tipo !== "todas" ? { type: tipo } : {}),
      ...(categoryId !== null ? { categoryIds: [categoryId] } : {}),
    }),
    [range, periodStart, periodEnd, debouncedQuery, tipo, categoryId],
  );
  // The refreshKey rides on the key (not the query): a sync bumps it, the
  // same filters refetch, and the appended pages reset with everything else.
  const requestKey = `${JSON.stringify(request)}#${refreshKey}`;

  const list = useApi(requestKey, () => fetchTransactions(request));
  const categories = useApi("categories", fetchCategories);

  const [head, setHead] = useState<TransactionsResponse | null>(null);
  const [appended, setAppended] = useState<readonly TransactionRow[]>([]);
  const [tail, setTail] = useState<{ readonly hasMore: boolean; readonly nextAfter: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (list.data !== null) {
      setHead(list.data);
    }
  }, [list.data]);

  // A filter or window change invalidates the appended pages: they belong to
  // the previous query, and keeping them would duplicate rows.
  useEffect(() => {
    setAppended([]);
    setTail(null);
  }, [requestKey]);

  const [detail, setDetail] = useState<TransactionRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);

  const loaded = head !== null && head.ok ? head : null;
  const rows = useMemo(() => (loaded === null ? [] : [...loaded.rows, ...appended]), [loaded, appended]);
  const hasMore = loaded !== null ? (tail !== null ? tail.hasMore : loaded.hasMore) : false;
  const nextAfter = loaded !== null ? (tail !== null ? tail.nextAfter : loaded.nextAfter) : null;

  const loadMore = useCallback(() => {
    if (nextAfter === null || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setLoadProblem(null);
    fetchTransactions({ ...request, limit: NEXT_PAGES, after: nextAfter })
      .then((next) => {
        if (next.ok) {
          setAppended((current) => [...current, ...next.rows]);
          setTail({ hasMore: next.hasMore, nextAfter: next.nextAfter });
        }
      })
      .catch(() => {
        setLoadProblem("Não foi possível carregar mais transações. Tente de novo.");
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [nextAfter, loadingMore, request]);

  const saveChanges = useCallback(
    (row: TransactionRow, category: string, note: string) => {
      const categoryChanged = category !== "" && category !== row.categoryId;
      const noteChanged = note.trim() !== (row.note ?? "");
      if (!categoryChanged && !noteChanged) {
        return;
      }
      setSaving(true);
      setSaveProblem(null);
      Promise.all([
        categoryChanged ? postTransactionCategory({ ids: [row.id], categoryId: category }) : Promise.resolve(null),
        noteChanged ? postTransactionNote(row.id, note) : Promise.resolve(null),
      ])
        .then(([categoryResult, noteResult]) => {
          if (categoryResult !== null && categoryResult.unknownIds.includes(row.id)) {
            setSaveProblem("Esta transação não está mais no cache. Recarregue a página e tente de novo.");
            return;
          }
          if (noteResult !== null && !noteResult.known) {
            setSaveProblem("Esta transação não está mais no cache. Recarregue a página e tente de novo.");
            return;
          }
          const corrected = (candidate: TransactionRow): TransactionRow => {
            if (candidate.id !== row.id) {
              return candidate;
            }
            let updated = candidate;
            if (categoryChanged) {
              updated = { ...updated, categoryId: category, categoryName: categoryName(category), categorySrc: "override" };
            }
            if (noteChanged) {
              updated = { ...updated, note: noteResult !== null ? noteResult.note : note.trim() };
            }
            return updated;
          };
          setHead((current) => (current !== null && current.ok ? { ...current, rows: current.rows.map(corrected) } : current));
          setAppended((current) => current.map(corrected));
          list.refetch();
          setDetail(null);
        })
        .catch(() => {
          setSaveProblem("Não foi possível salvar as alterações. Tente de novo.");
        })
        .finally(() => {
          setSaving(false);
        });
    },
    [list],
  );

  if (list.error !== null) {
    return (
      <section className="view enter" aria-label="Transações">
        <div className="card" role="alert">
          <div className="card-title">Não foi possível carregar as transações</div>
          <p className="card-sub">{list.error}</p>
        </div>
      </section>
    );
  }

  if (head === null) {
    return (
      <section className="view enter" aria-label="Transações">
        <div className="card">
          <div className="card-title">Transações</div>
          <p className="card-sub">{list.loading ? "Carregando…" : "Sem dados."}</p>
        </div>
      </section>
    );
  }

  if (!head.ok) {
    return (
      <section className="view enter" aria-label="Transações">
        <div className="card" role="alert">
          <div className="card-title">Configuração pendente</div>
          <ul>
            {head.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section className="view enter" aria-label="Transações" data-od-id="tx-view">
      {head.unavailable.length > 0 && <UnavailableNotice unavailable={head.unavailable} />}

      <div className="grid-1-2" style={{ alignItems: "start" }}>
        <BreakdownSidebar
          breakdown={head.breakdown}
          selected={categoryId}
          direction={tipo}
          onSelect={changeCategory}
        />

        <div className="card" data-od-id="tx-list">
          <div className="card-head">
            <div>
              <div className="card-title">Transações</div>
              <div className="card-sub" data-od-id="tx-count">
                {head.totalInWindow} {head.totalInWindow === 1 ? "transação" : "transações"}
              </div>
            </div>
          </div>

          <div className="filter-bar" style={{ marginBottom: 14 }}>
            <label className="search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder="Buscar descrição ou contraparte"
                aria-label="Buscar transações"
                onChange={(event) => changeQuery(event.target.value)}
              />
            </label>
            <Seg
              options={TIPO_OPTIONS}
              value={tipo}
              onChange={(value) => changeTipo(value as TransactionTypeFilter)}
              label="Tipo de movimentação"
            />
            <select
              className="input"
              style={{ width: "auto" }}
              value={categoryId ?? ""}
              aria-label="Filtrar por categoria"
              onChange={(event) => changeCategory(event.target.value === "" ? null : event.target.value)}
            >
              <option value="">Todas as categorias</option>
              <option value="none">Sem categoria</option>
              {(categories.data?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(row) => row.id}
            emptyMessage="Nenhuma transação encontrada com esses filtros."
            onActivate={setDetail}
            rowAriaLabel={(row) => `Ver detalhes: ${row.description}`}
          />

          {hasMore && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 14 }}>
              <Button variant="ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Carregando…" : "Mostrar mais"}
              </Button>
              {loadProblem !== null ? <p className="meta" style={{ color: "var(--neg)", margin: 0 }}>{loadProblem}</p> : null}
            </div>
          )}
        </div>
      </div>

      <TransactionDetailModal
        row={detail}
        categories={categories.data?.categories ?? []}
        saving={saving}
        problem={saveProblem}
        onClose={() => {
          setDetail(null);
          setSaveProblem(null);
        }}
        onSave={saveChanges}
      />
    </section>
  );
}

/* ─── the table ─────────────────────────────────────────────────── */

const COLUMNS: readonly TableColumn<TransactionRow>[] = [
  {
    header: "Data",
    numeric: true,
    render: (row) => <span style={{ whiteSpace: "nowrap" }}>{dayMonthShort(row.localDate)}</span>,
  },
  {
    header: "Descrição",
    render: (row) => (
      <div>
        <div className="tx-desc">{row.description}</div>
        <div className="tx-cat">
          <i style={{ background: categoryColor(row.categoryId) }}></i>
          {row.categoryName ?? "Sem categoria"}
          {row.internal ? (
            <span className="tag" style={{ marginLeft: 6 }}>
              interna
            </span>
          ) : null}
          {row.note !== null ? <NoteChip note={row.note} /> : null}
        </div>
      </div>
    ),
  },
  {
    header: "Tipo",
    render: (row) => (
      <span className={`tx-type ${paymentMethodClass(row)}`}>{row.paymentMethod}</span>
    ),
  },
  {
    header: "Status",
    render: (row) => <span className="tag">{row.status}</span>,
  },
  {
    header: "Valor",
    numeric: true,
    render: (row) => (
      <span className={row.amountCents > 0 ? "val-pos" : "val-neg"}>
        {row.amountCents > 0 ? "+" : ""}
        {centsToBRL(row.amountCents)}
      </span>
    ),
  },
];

/* ─── the breakdown sidebar ─────────────────────────────────────── */

function BreakdownSidebar({
  breakdown,
  selected,
  direction,
  onSelect,
}: {
  readonly breakdown: readonly BreakdownSlice[];
  /** The active category filter; "none" is the Sem categoria slice. */
  readonly selected: string | null;
  readonly direction: TransactionTypeFilter;
  readonly onSelect: (value: string | null) => void;
}) {
  const total = breakdown.reduce((sum, slice) => sum + slice.totalCents, 0);
  return (
    <div className="card card-tight">
      <div className="card-head">
        <div>
          <div className="card-title">{direction === "receitas" ? "Receitas por categoria" : "Despesas por categoria"}</div>
          <div className="card-sub">{centsToBRL(total)}</div>
        </div>
      </div>
      {breakdown.length === 0 ? (
        <div className="cat-empty">Sem movimentações neste período</div>
      ) : (
        <div className={`cat-chart${selected !== null ? " has-filter" : ""}`}>
          {breakdown.map((slice) => {
            const value = slice.categoryId ?? "none";
            const active = selected === value;
            return (
              <button
                key={value}
                type="button"
                className={`cat-row${active ? " on" : ""}`}
                aria-pressed={active}
                onClick={() => onSelect(active ? null : value)}
              >
                <span className="cat-top">
                  <i className="cat-dot" style={{ background: categoryColor(slice.categoryId) }}></i>
                  <span className="cat-name">{slice.name}</span>
                  <span className="cat-meta">
                    <b className="num">{centsToBRL(slice.totalCents)}</b>
                    <span>{slicePercent(slice, total)}</span>
                  </span>
                </span>
                <span className="cat-track">
                  <span className="cat-fill" style={{ width: `${sliceWidth(slice, total)}%`, background: categoryColor(slice.categoryId) }}></span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Bar width only — a float that never feeds back into money. */
function sliceWidth(slice: BreakdownSlice, totalCents: number): number {
  if (totalCents <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((slice.totalCents / totalCents) * 1000) / 10);
}

function slicePercent(slice: BreakdownSlice, totalCents: number): string {
  return `${percentBRL(sliceWidth(slice, totalCents))}`;
}

/* ─── the detail modal ──────────────────────────────────────────── */

function TransactionDetailModal({
  row,
  categories,
  saving,
  problem,
  onClose,
  onSave,
}: {
  readonly row: TransactionRow | null;
  readonly categories: readonly CategoryOption[];
  readonly saving: boolean;
  readonly problem: string | null;
  readonly onClose: () => void;
  readonly onSave: (row: TransactionRow, categoryId: string, note: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    setSelected(row?.categoryId ?? "");
    setNoteDraft(row?.note ?? "");
  }, [row]);

  if (row === null) {
    return null;
  }

  const time = clockTimeOf(row.occurredAt);
  const categoryChanged = selected !== "" && selected !== row.categoryId;
  const noteChanged = noteDraft.trim() !== (row.note ?? "");
  const unchanged = !categoryChanged && !noteChanged;

  return (
    <Modal
      title={row.description}
      sub={`${dayMonthShort(row.localDate)}${time === null ? "" : ` · ${time}`}`}
      open
      onClose={onClose}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <span className="meta">Valor</span>
        <span className={`num ${row.amountCents > 0 ? "val-pos" : "val-neg"}`} style={{ fontSize: 22, fontWeight: 650 }}>
          {row.amountCents > 0 ? "+" : ""}
          {centsToBRL(row.amountCents)}
        </span>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: "0 0 16px" }}>
        <dt className="meta">Data</dt>
        <dd style={{ margin: 0 }}>{fullDate(row.localDate)}</dd>
        <dt className="meta">Conta</dt>
        <dd style={{ margin: 0 }}>{row.accountName}</dd>
        <dt className="meta">Tipo</dt>
        <dd style={{ margin: 0 }}>{row.paymentMethod}</dd>
        <dt className="meta">Status</dt>
        <dd style={{ margin: 0 }}>{row.status}</dd>
      </dl>

      <div className="field">
        <label htmlFor="tx-category">Categoria</label>
        <select id="tx-category" className="input" value={selected} onChange={(event) => setSelected(event.target.value)}>
          {row.categoryId === null ? <option value="">Sem categoria</option> : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {row.categorySrc === "override" ? <p className="meta" style={{ margin: 0 }}>Corrigida por você</p> : null}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="tx-note">Nota (opcional)</label>
        <textarea
          id="tx-note"
          className="input"
          rows={2}
          maxLength={500}
          placeholder="Ex.: presente da Marina"
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
        />
      </div>

      {problem !== null ? <p className="meta" style={{ color: "var(--neg)", marginTop: 12 }}>{problem}</p> : null}

      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
        <Button variant="primary" disabled={saving || unchanged} onClick={() => onSave(row, selected, noteDraft)}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </Modal>
  );
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

/** "19 mar 2026" — the modal's date, with the year the list omits. */
function fullDate(localDate: string): string {
  const month = MONTHS_SHORT[Number(localDate.slice(5, 7)) - 1] ?? "?";
  return `${Number(localDate.slice(8, 10))} ${month} ${localDate.slice(0, 4)}`;
}
