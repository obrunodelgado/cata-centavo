"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchCategories,
  fetchTransactions,
  postTransactionCategory,
  postTransactionDescription,
  postTransactionNote,
  postTransactionSaque,
  postTransactionSplit,
  type TransactionsQuery,
} from "../../lib/api.ts";
import type { BreakdownSlice, CategoryOption, TransactionRow, TransactionsResponse, TransactionTypeFilter } from "../../lib/contracts.ts";
import { dayMonthShort } from "../../lib/datetime.ts";
import { categoryColor, categoryName, paymentMethodClass } from "../../lib/labels.ts";
import { centsToBRL, parseCentsInput, percentBRL } from "../../lib/money.ts";
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
 * real: one "Salvar alterações" action persists the description rename, the
 * category and the note — each only when it changed — patches the row in place
 * and silently refetches the head so the sidebar keeps up; scroll and
 * pagination stay put. A recognised saque (ADR-0004) opens the split editor
 * instead of the category select: its alocações feed the category totals, the
 * sobra não alocada is information, never an error, and the mark itself is an
 * immediate write. A row with a note shows the small hint chip in the list; the
 * native `title` is the v1 tooltip.
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

  /** Patches one row in place across the head and the appended pages, and refetches the head for the sidebar. */
  const patchRow = useCallback(
    (fresh: TransactionRow) => {
      const corrected = (candidate: TransactionRow): TransactionRow => (candidate.id === fresh.id ? fresh : candidate);
      setHead((current) => (current !== null && current.ok ? { ...current, rows: current.rows.map(corrected) } : current));
      setAppended((current) => current.map(corrected));
      list.refetch();
    },
    [list],
  );

  const saveChanges = useCallback(
    async (row: TransactionRow, edits: { readonly description: string; readonly categoryId: string; readonly note: string; readonly allocations: readonly { readonly categoryId: string; readonly amountCents: number }[] | null }) => {
      const descriptionChanged = edits.description.trim() !== row.description;
      const categoryChanged = edits.categoryId !== "" && edits.categoryId !== row.categoryId;
      const noteChanged = edits.note.trim() !== (row.note ?? "");
      const splitChanged = edits.allocations !== null && JSON.stringify(edits.allocations) !== JSON.stringify(row.allocations);
      if (!descriptionChanged && !categoryChanged && !noteChanged && !splitChanged) {
        return;
      }
      setSaving(true);
      setSaveProblem(null);
      const staleCache = "Esta transação não está mais no cache. Recarregue a página e tente de novo.";
      try {
        if (splitChanged) {
          const splitResult = await postTransactionSplit(row.id, edits.allocations!);
          if (!splitResult.ok) {
            setSaveProblem(splitResult.problems[0] ?? "Não foi possível salvar a divisão. Tente de novo.");
            return;
          }
          if (splitResult.row === null) {
            setSaveProblem(staleCache);
            return;
          }
          patchRow(splitResult.row);
          setDetail(splitResult.row);
        }
        if (descriptionChanged) {
          const descriptionResult = await postTransactionDescription(row.id, edits.description);
          if (!descriptionResult.ok) {
            setSaveProblem(descriptionResult.problems[0] ?? "Não foi possível salvar o nome. Tente de novo.");
            return;
          }
          if (!descriptionResult.known) {
            setSaveProblem(staleCache);
            return;
          }
        }
        if (categoryChanged) {
          const categoryResult = await postTransactionCategory({ ids: [row.id], categoryId: edits.categoryId });
          if (categoryResult.unknownIds.includes(row.id)) {
            setSaveProblem(staleCache);
            return;
          }
        }
        if (noteChanged) {
          const noteResult = await postTransactionNote(row.id, edits.note);
          if (!noteResult.known) {
            setSaveProblem(staleCache);
            return;
          }
        }
        const corrected = (candidate: TransactionRow): TransactionRow => {
          if (candidate.id !== row.id) {
            return candidate;
          }
          let updated = candidate;
          if (descriptionChanged) {
            updated = { ...updated, description: edits.description.trim() };
          }
          if (categoryChanged) {
            updated = { ...updated, categoryId: edits.categoryId, categoryName: categoryName(edits.categoryId), categorySrc: "override" };
          }
          if (noteChanged) {
            updated = { ...updated, note: edits.note.trim() };
          }
          return updated;
        };
        setHead((current) => (current !== null && current.ok ? { ...current, rows: current.rows.map(corrected) } : current));
        setAppended((current) => current.map(corrected));
        list.refetch();
        setDetail(null);
      } catch {
        setSaveProblem("Não foi possível salvar as alterações. Tente de novo.");
      } finally {
        setSaving(false);
      }
    },
    [list, patchRow],
  );

  const changeMark = useCallback(
    async (row: TransactionRow, recognised: "saque" | "estorno" | "none") => {
      setSaving(true);
      setSaveProblem(null);
      try {
        const result = await postTransactionSaque(row.id, recognised);
        if (!result.ok) {
          setSaveProblem(result.problems[0] ?? "Não foi possível salvar a marcação. Tente de novo.");
          return;
        }
        if (result.row === null) {
          setSaveProblem("Esta transação não está mais no cache. Recarregue a página e tente de novo.");
          return;
        }
        patchRow(result.row);
        setDetail(result.row);
      } catch {
        setSaveProblem("Não foi possível salvar a marcação. Tente de novo.");
      } finally {
        setSaving(false);
      }
    },
    [patchRow],
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
          unallocatedSaqueCents={head.unallocatedSaqueCents}
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
        onMark={changeMark}
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
          {row.recognised === "saque" ? <SaqueBadge row={row} /> : null}
          {row.note !== null ? <NoteChip note={row.note} /> : null}
        </div>
        {row.recognised === "saque" && row.allocations.length > 0 ? (
          <div className="tx-alloc" title="Alocações do saque">
            {row.allocations.map((allocation) => `${categoryName(allocation.categoryId)} ${centsToBRL(allocation.amountCents)}`).join(" · ")}
          </div>
        ) : null}
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

/** The split badge: not detailed, fully split, or split with a sobra left. */
function SaqueBadge({ row }: { readonly row: TransactionRow }) {
  const total = -row.amountCents;
  const allocated = row.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  if (row.allocations.length === 0) {
    return (
      <span className="tag" style={{ marginLeft: 6 }} title="Clique para detalhar em categorias">
        não detalhado
      </span>
    );
  }
  if (allocated >= total) {
    const count = row.allocations.length;
    return (
      <span className="tag accent" style={{ marginLeft: 6 }} title={`Dividida entre ${count} categorias`}>
        dividida · {count} {count === 1 ? "categoria" : "categorias"}
      </span>
    );
  }
  return (
    <span className="tag accent" style={{ marginLeft: 6 }} title={`${centsToBRL(total - allocated)} sem categoria`}>
      dividida parcialmente · {row.allocations.length} cat.
    </span>
  );
}

/* ─── the breakdown sidebar ─────────────────────────────────────── */

function BreakdownSidebar({
  breakdown,
  selected,
  direction,
  unallocatedSaqueCents,
  onSelect,
}: {
  readonly breakdown: readonly BreakdownSlice[];
  /** The active category filter; "none" is the Sem categoria slice. */
  readonly selected: string | null;
  readonly direction: TransactionTypeFilter;
  /** Saque money no alocação attributes — the note under the chart, zero when fully detailed. */
  readonly unallocatedSaqueCents: number;
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
      {unallocatedSaqueCents > 0 ? (
        <p className="cat-note">
          Soma inclui <b className="num">{centsToBRL(unallocatedSaqueCents)}</b> de saques ainda não alocados — detalhe-os na lista para
          direcionar à categoria certa.
        </p>
      ) : null}
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

type SplitDraft = { readonly categoryId: string; readonly text: string };

/**
 * The two variants share one shell — title, value box, metadata, description
 * field, note — and differ in the middle: a recognised saque edits its
 * alocações, everything else edits the category. The mark ("Marcar como
 * saque" / "Remover marcação") is an immediate write, not part of the batch;
 * the rename, the category, the note and the split save together.
 */
function TransactionDetailModal({
  row,
  categories,
  saving,
  problem,
  onClose,
  onSave,
  onMark,
}: {
  readonly row: TransactionRow | null;
  readonly categories: readonly CategoryOption[];
  readonly saving: boolean;
  readonly problem: string | null;
  readonly onClose: () => void;
  readonly onSave: (row: TransactionRow, edits: {
    readonly description: string;
    readonly categoryId: string;
    readonly note: string;
    readonly allocations: readonly { readonly categoryId: string; readonly amountCents: number }[] | null;
  }) => void | Promise<void>;
  readonly onMark: (row: TransactionRow, recognised: "saque" | "estorno" | "none") => void | Promise<void>;
}) {
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [selected, setSelected] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [splitDraft, setSplitDraft] = useState<readonly SplitDraft[]>([]);

  useEffect(() => {
    setDescriptionDraft(row?.description ?? "");
    setSelected(row?.categoryId ?? "");
    setNoteDraft(row?.note ?? "");
    setSplitDraft(row?.allocations.map((allocation) => ({ categoryId: allocation.categoryId, text: centsToInputText(allocation.amountCents) })) ?? []);
  }, [row]);

  if (row === null) {
    return null;
  }

  const isSaque = row.recognised === "saque";
  const descriptionChanged = descriptionDraft.trim() !== row.description;
  const categoryChanged = !isSaque && selected !== "" && selected !== row.categoryId;
  const noteChanged = noteDraft.trim() !== (row.note ?? "");
  const parsedSplit = isSaque ? parseSplitDraft(splitDraft) : null;
  const splitChanged = parsedSplit !== null && JSON.stringify(parsedSplit) !== JSON.stringify(row.allocations);
  const unchanged = !descriptionChanged && !categoryChanged && !noteChanged && !splitChanged;

  return (
    <Modal
      title="Detalhes da Transação"
      sub={`${dayMonthShort(row.localDate)} · ${row.description} · ${row.paymentMethod} · ${row.status}`}
      open
      onClose={onClose}
    >
      <div className="split-summary">
        <span className="lbl">{valueLabel(row.amountCents)}</span>
        <span className={`amt num ${valueTone(row.amountCents)}`}>{centsToBRL(row.amountCents)}</span>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: "16px 0 0" }}>
        <dt className="meta">Data</dt>
        <dd style={{ margin: 0 }}>{fullDate(row.localDate)}</dd>
        <dt className="meta">Conta</dt>
        <dd style={{ margin: 0 }}>{row.accountName}</dd>
        <dt className="meta">Tipo</dt>
        <dd style={{ margin: 0 }}>{row.paymentMethod}</dd>
        <dt className="meta">Status</dt>
        <dd style={{ margin: 0 }}>{row.status}</dd>
      </dl>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="tx-description">Descrição</label>
        <input
          id="tx-description"
          className="input"
          type="text"
          maxLength={120}
          value={descriptionDraft}
          onChange={(event) => setDescriptionDraft(event.target.value)}
        />
        <p className="rename-note">
          Salvar aplica o novo nome a <b>todas as transações com a mesma descrição</b>.
        </p>
      </div>

      {isSaque ? (
        <SplitEditor
          row={row}
          categories={categories}
          draft={splitDraft}
          onDraft={setSplitDraft}
        />
      ) : (
        <div className="field" style={{ marginTop: 14 }}>
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
      )}

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
        <MarkAction row={row} saving={saving} onMark={onMark} />
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
        <Button
          variant="primary"
          disabled={saving || unchanged}
          onClick={() => {
            void onSave(row, { description: descriptionDraft, categoryId: saveCategory(isSaque, selected), note: noteDraft, allocations: parsedSplit });
          }}
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </Modal>
  );
}

/* ─── the split editor ──────────────────────────────────────────── */

/**
 * The alocações of one saque. Values are typed as pt-BR text and parsed by
 * string arithmetic (`parseCentsInput`) — no money passes through a float. The
 * sobra is information: the bar turns green when it zeroes, red when the draft
 * overflows, and only the overflow blocks saving.
 */
function SplitEditor({
  row,
  categories,
  draft,
  onDraft,
}: {
  readonly row: TransactionRow;
  readonly categories: readonly CategoryOption[];
  readonly draft: readonly SplitDraft[];
  readonly onDraft: (draft: readonly SplitDraft[]) => void;
}) {
  const total = -row.amountCents;
  const allocated = draft.reduce((sum, line) => sum + (parseCentsInput(line.text) ?? 0), 0);
  const leftover = total - allocated;
  const over = leftover < 0;
  const pct = total <= 0 ? 0 : Math.min(100, Math.round((Math.min(allocated, total) / total) * 1000) / 10);

  const addLine = () => {
    onDraft([...draft, { categoryId: "", text: "" }]);
  };
  const removeLine = (index: number) => {
    onDraft(draft.filter((_, candidate) => candidate !== index));
  };
  const changeLine = (index: number, next: SplitDraft) => {
    onDraft(draft.map((line, candidate) => (candidate === index ? next : line)));
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="split-progress">
        <div className="progress" role="img" aria-label="Progresso de alocação do saque">
          <div className={`progress-bar ${barTone(allocated, leftover)}`} style={{ width: `${pct}%`, background: "var(--accent)" }}></div>
        </div>
        <div className="split-progress-caption">
          <span>
            alocado <b>{centsToBRL(Math.min(allocated, total))}</b> de {centsToBRL(total)}
          </span>
          <span className={`restante ${restanteTone(allocated, leftover)}`}>{restanteText(allocated, leftover, total)}</span>
        </div>
      </div>

      <div className="alloc-list">
        <div className="alloc-list-label">Divisão por categoria</div>
        {draft.length === 0 ? (
          <div className="alloc-empty">Nenhuma categoria ainda — o saque inteiro fica em Sem categoria.</div>
        ) : (
          draft.map((line, index) => (
            <div className="alloc-row" key={index}>
              <select
                className="input"
                aria-label={`Categoria da linha ${index + 1}`}
                value={line.categoryId}
                onChange={(event) => changeLine(index, { ...line, categoryId: event.target.value })}
              >
                <option value="">Categoria…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                className="input val"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                aria-label={`Valor da linha ${index + 1}`}
                value={line.text}
                onChange={(event) => changeLine(index, { ...line, text: event.target.value })}
              />
              <button
                type="button"
                className="alloc-del"
                aria-label={`Remover linha ${index + 1}`}
                title="Remover"
                onClick={() => removeLine(index)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          ))
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button variant="secondary" className="alloc-add" onClick={addLine} disabled={draft.length >= 20}>
            Adicionar categoria
          </Button>
          {(draft.length > 0 || row.allocations.length > 0) && (
            <Button
              variant="ghost"
              className="alloc-add"
              onClick={() => {
                onDraft([]);
              }}
            >
              Desfazer divisão
            </Button>
          )}
        </div>
      </div>

      <div className={`split-hint ${over ? "error" : "info"}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v4h1" />
        </svg>
        <span>
          {over
            ? `A soma excede o saque (${centsToBRL(total)}). Ajuste os valores para salvar.`
            : "O que sobrar sem categoria fica como não alocado — aparece nos relatórios, sem bloquear o salvamento."}
        </span>
      </div>
    </div>
  );
}

/** The draft, saved-ready: parsed cents, no empty or zero lines, one row per category. */
function parseSplitDraft(draft: readonly SplitDraft[]): readonly { readonly categoryId: string; readonly amountCents: number }[] {
  const byCategory = new Map<string, number>();
  for (const line of draft) {
    if (line.categoryId === "") {
      continue;
    }
    const cents = parseCentsInput(line.text);
    if (cents === null || cents === 0) {
      continue;
    }
    byCategory.set(line.categoryId, cents);
  }
  return [...byCategory.entries()].map(([categoryId, amountCents]) => ({ categoryId, amountCents }));
}

/** The saque modal saves no category — the alocações name the categories instead. */
function saveCategory(isSaque: boolean, selected: string): string {
  if (isSaque) {
    return "";
  }
  return selected;
}

/** The modal's left action: unmark a recognised row, mark an eligible despesa, nothing otherwise. */
function MarkAction({
  row,
  saving,
  onMark,
}: {
  readonly row: TransactionRow;
  readonly saving: boolean;
  readonly onMark: (row: TransactionRow, recognised: "saque" | "estorno" | "none") => void | Promise<void>;
}) {
  if (row.recognised === "saque") {
    const blocked = row.allocations.length > 0;
    return (
      <Button
        variant="ghost"
        disabled={saving || blocked}
        title={unmarkHint(blocked)}
        onClick={() => {
          void onMark(row, "none");
        }}
      >
        Remover marcação
      </Button>
    );
  }
  if (row.amountCents < 0) {
    return (
      <Button
        variant="ghost"
        disabled={saving}
        onClick={() => {
          void onMark(row, "saque");
        }}
      >
        Marcar como saque
      </Button>
    );
  }
  return null;
}

/** Q8a: nothing disappears silently — a saved split must be undone first. */
function unmarkHint(blocked: boolean): string | undefined {
  if (blocked) {
    return "Salve a divisão desfazida primeiro";
  }
  return undefined;
}

/** The value box's label: what the movement did, in the domain's words. */
function valueLabel(amountCents: number): string {
  if (amountCents > 0) {
    return "Valor recebido";
  }
  return "Valor da despesa";
}

/** The value box's tone: a receita in green, a despesa in the foreground. */
function valueTone(amountCents: number): string {
  if (amountCents > 0) {
    return "pos";
  }
  return "";
}

/** The split bar's tone: green when fully allocated, red when overflowing. */
function barTone(allocatedCents: number, leftoverCents: number): string {
  if (leftoverCents < 0) {
    return "over";
  }
  if (leftoverCents === 0 && allocatedCents > 0) {
    return "full";
  }
  return "";
}

/** The caption's tone class, matching the bar. */
function restanteTone(allocatedCents: number, leftoverCents: number): string {
  if (leftoverCents < 0) {
    return "estouro";
  }
  if (leftoverCents === 0 && allocatedCents > 0) {
    return "zerado";
  }
  return "";
}

/** The caption's text: the sobra as information, never as an error. */
function restanteText(allocatedCents: number, leftoverCents: number, totalCents: number): string {
  if (leftoverCents < 0) {
    return `${centsToBRL(-leftoverCents)} acima do saque`;
  }
  if (leftoverCents === 0 && allocatedCents > 0) {
    return "totalmente alocado";
  }
  if (allocatedCents === 0) {
    return `${centsToBRL(totalCents)} não alocados`;
  }
  return `${centsToBRL(leftoverCents)} não alocados`;
}

/** Cents → the input's own text, so a stored alocação reads back as typed. */
function centsToInputText(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  if (fraction === "00") {
    return String(whole);
  }
  return `${whole},${fraction}`;
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

/** "19 mar 2026" — the modal's date, with the year the list omits. */
function fullDate(localDate: string): string {
  const month = MONTHS_SHORT[Number(localDate.slice(5, 7)) - 1] ?? "?";
  return `${Number(localDate.slice(8, 10))} ${month} ${localDate.slice(0, 4)}`;
}
