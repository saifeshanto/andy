import type { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** No inner padding, for lists and tables that run edge to edge. */
  flush?: boolean;
  tone?: 'light' | 'dark';
};

export function Card({ className = '', flush = false, tone = 'light', ...props }: CardProps) {
  const bg = tone === 'dark' ? 'bg-ink-950 text-white' : 'bg-white';
  return <div className={`rounded-card shadow-card ${bg} ${flush ? '' : 'p-6'} ${className}`} {...props} />;
}
