"use client";

/** The five views of the prototype, in navigation order. */
export const VIEWS = [
  { id: "visao-geral", title: "Visão geral" },
  { id: "transacoes", title: "Transações" },
  { id: "analises", title: "Análises" },
  { id: "orcamentos", title: "Orçamentos" },
  { id: "cartoes", title: "Cartões" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

export const TITLES: Readonly<Record<ViewId, string>> = Object.fromEntries(
  VIEWS.map((view) => [view.id, view.title]),
) as Readonly<Record<ViewId, string>>;

export function isViewId(value: string): value is ViewId {
  return VIEWS.some((view) => view.id === value);
}
