import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-ink-950 px-4 py-10">
      <Link to="/" className="mx-auto mb-8 font-display text-2xl font-bold uppercase tracking-wide text-white">
        Andy <span className="text-accent-400">Auto Club</span>
      </Link>
      <div className="mx-auto w-full max-w-md rounded-card bg-white p-6 shadow-card sm:p-8">
        <h1 className="font-display text-3xl font-bold uppercase">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mx-auto mt-6 text-sm text-ink-300">{footer}</div>}
    </main>
  );
}
