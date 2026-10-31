import { formatRM } from '@andy/shared';

/** The only way to show money in the UI (AGENTS.md section 9). */
export function MoneyRM({ sen, className = '' }: { sen: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatRM(sen)}</span>;
}
