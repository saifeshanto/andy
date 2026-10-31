import type { ReactNode } from 'react';

type Tone = 'danger' | 'success' | 'info' | 'warning';
const tones: Record<Tone, string> = {
  danger: 'border-danger-500/30 bg-danger-500/5 text-danger-500',
  success: 'border-success-500/30 bg-success-500/5 text-success-500',
  info: 'border-info-500/30 bg-info-500/5 text-info-500',
  warning: 'border-warning-500/30 bg-warning-500/5 text-warning-500',
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
