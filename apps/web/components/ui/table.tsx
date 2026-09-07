"use client";

import { memo, type JSX, type ReactNode } from "react";

export type TableColumn<T> = {
  readonly header: string;
  /** Right-aligned monospace column (money, dates). */
  readonly numeric?: boolean;
  readonly render: (row: T) => ReactNode;
};

type TableRowProps<T> = {
  readonly row: T;
  readonly columns: readonly TableColumn<T>[];
  readonly onActivate: ((row: T) => void) | undefined;
  readonly ariaLabel: ((row: T) => string) | undefined;
};

/**
 * Memoized so "Mostrar mais" appends without re-rendering the rows already on
 * screen: the columns are a module constant and the activate handler is
 * stable, so a row re-renders only when its own data changes. React's `memo`
 * erases generics, so the memoized component is recast to the generic shape
 * it actually is.
 */
const GenericTableRow = memo(function TableRow<T>({ row, columns, onActivate, ariaLabel }: TableRowProps<T>) {
  const activatable = onActivate !== undefined;
  return (
    <tr
      tabIndex={activatable ? 0 : undefined}
      role={activatable ? "button" : undefined}
      aria-label={activatable && ariaLabel !== undefined ? ariaLabel(row) : undefined}
      onClick={activatable ? () => onActivate(row) : undefined}
      onKeyDown={
        activatable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate(row);
              }
            }
          : undefined
      }
    >
      {columns.map((column) => (
        <td key={column.header} className={column.numeric ? "num-col" : undefined}>
          {column.render(row)}
        </td>
      ))}
    </tr>
  );
}) as <T>(props: TableRowProps<T>) => JSX.Element;

type DataTableProps<T> = {
  readonly columns: readonly TableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly emptyMessage: string;
  /** When set, rows are keyboard- and click-activatable (the prototype's row behavior). */
  readonly onActivate?: (row: T) => void;
  readonly rowAriaLabel?: (row: T) => string;
};

/** The prototype's `.ds-table`, shared by every view that renders rows. */
export function DataTable<T>({ columns, rows, rowKey, emptyMessage, onActivate, rowAriaLabel }: DataTableProps<T>) {
  return (
    <div className="tbl-scroll">
      <table className="ds-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} className={column.numeric ? "num-col" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: "center", color: "var(--muted)", padding: "24px 0" }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <GenericTableRow
                key={rowKey(row)}
                row={row}
                columns={columns}
                onActivate={onActivate}
                ariaLabel={rowAriaLabel}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
