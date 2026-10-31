import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-ink-100 px-6 py-12 text-center">
      <p className="font-semibold text-ink-800">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-500">{children}</div>}
    </div>
  );
}
