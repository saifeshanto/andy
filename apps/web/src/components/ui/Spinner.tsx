export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12 text-ink-500">
      <span className="size-5 animate-spin rounded-full border-2 border-ink-100 border-t-accent-500" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}
