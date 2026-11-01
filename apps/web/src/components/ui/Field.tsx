import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

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

const control = (error?: string) =>
  `block w-full rounded-xl border bg-white px-3.5 text-base text-ink-900 placeholder:text-ink-300 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${error ? 'border-danger-500' : 'border-ink-100'}`;

function Help({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) return <p id={`${id}-error`} className="mt-1.5 text-sm text-danger-500">{error}</p>;
  if (hint) return <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-500">{hint}</p>;
  return null;
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
  options: readonly (string | { value: string; label: string })[];
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField({ label, error, hint, options, placeholder, className = '', ...props }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-800">{label}</label>
      <select ref={ref} id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`min-h-11 ${control(error)}`} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const { value, label: text } = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
      <Help id={id} error={error} hint={hint} />
    </div>
  );
});

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField({ label, error, hint, className = '', rows = 4, ...props }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-800">{label}</label>
      <textarea ref={ref} id={id} rows={rows} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`py-2.5 ${control(error)}`} {...props} />
      <Help id={id} error={error} hint={hint} />
    </div>
  );
});
