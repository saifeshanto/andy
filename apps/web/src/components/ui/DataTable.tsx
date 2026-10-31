import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Table on wide screens, stacked cards on phones (AGENTS.md section 9). */
export function DataTable<T>({ rows, columns, rowKey, onRowClick }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-card bg-white shadow-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.className ?? ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'cursor-pointer hover:bg-ink-50' : ''}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-top ${c.className ?? ''}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              className="rounded-card bg-white p-4 shadow-card"
            >
              <dl className="space-y-1.5 text-sm">
                {columns.map((c) => (
                  <div key={c.key} className="flex justify-between gap-4">
                    <dt className="text-ink-500">{c.header}</dt>
                    <dd className="text-right break-all">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <button className="min-h-11 rounded-full px-4 font-semibold disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Previous
      </button>
      <span className="text-ink-500">
        Page {page} of {totalPages}
      </span>
      <button className="min-h-11 rounded-full px-4 font-semibold disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </div>
  );
}
