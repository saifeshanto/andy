import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

/** Labelled input with error text wired to aria-describedby. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, className = '', ...props }, ref) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-800">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`block min-h-11 w-full rounded-xl border bg-white px-3.5 text-base text-ink-900 placeholder:text-ink-300 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${error ? 'border-danger-500' : 'border-ink-100'}`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger-500">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
