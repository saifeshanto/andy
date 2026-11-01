import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-accent-500 text-white hover:bg-accent-600',
  secondary: 'bg-white text-ink-900 ring-1 ring-ink-100 hover:bg-ink-50',
  ghost: 'bg-transparent text-current hover:bg-ink-900/5',
  danger: 'bg-danger-500 text-white hover:bg-danger-500/90',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-colors disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
