import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { api, ApiError } from '@/lib/api';

type Value = string | boolean | number[];
interface FieldDef {
  key: string;
  label: string;
  kind: 'text' | 'boolean' | 'select' | 'numberList';
  help?: string;
  options?: { value: string; label: string }[];
}
interface SettingsData {
  values: Record<string, Value>;
  fields: FieldDef[];
}

const toDraft = (f: FieldDef, v: Value) => (f.kind === 'numberList' ? (v as number[]).join(', ') : v);
const fromDraft = (f: FieldDef, d: Value): Value =>
  f.kind === 'numberList'
    ? String(d)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
    : d;

function SettingRow({ field, value, canEdit }: { field: FieldDef; value: Value; canEdit: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Value>(toDraft(field, value));
  useEffect(() => setDraft(toDraft(field, value)), [field, value]);
  const save = useMutation({
    mutationFn: (v: Value) => api(`/admin/settings/${field.key}`, { method: 'PUT', json: { value: v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
  const error = save.error instanceof ApiError ? save.error.message : save.isError ? 'Could not save' : undefined;
  const help = field.help && <p className="mt-1 text-sm text-ink-500">{field.help}</p>;

  if (field.kind === 'boolean') {
    return (
      <div>
        <label className="flex min-h-11 items-center justify-between gap-4">
          <span className="text-sm font-medium">{field.label}</span>
          <input type="checkbox" className="size-5 accent-accent-500" checked={!!draft} disabled={!canEdit || save.isPending} onChange={(e) => { setDraft(e.target.checked); save.mutate(e.target.checked); }} />
        </label>
        {help}
      </div>
    );
  }
  if (field.kind === 'select') {
    return (
      <div>
        <label className="block text-sm font-medium" htmlFor={field.key}>{field.label}</label>
        <select id={field.key} className="mt-1.5 min-h-11 w-full rounded-xl border border-ink-100 bg-white px-3" value={String(draft)} disabled={!canEdit || save.isPending} onChange={(e) => { setDraft(e.target.value); save.mutate(e.target.value); }}>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {error && <p className="mt-1.5 text-sm text-danger-500">{error}</p>}
        {help}
      </div>
    );
  }
  return (
    <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); save.mutate(fromDraft(field, draft)); }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field className="flex-1" label={field.label} value={String(draft)} disabled={!canEdit} error={error} onChange={(e) => setDraft(e.target.value)} />
        {canEdit && <Button type="submit" variant="secondary" disabled={String(draft) === String(toDraft(field, value)) || save.isPending}>Save</Button>}
      </div>
      {help}
    </form>
  );
}

export function SettingsPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<{ data: SettingsData }>('/admin/settings').then((r) => r.data) });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">Could not load settings.</Alert>;
  const groups = [
    { title: 'Website', prefix: 'site.' },
    { title: 'Membership', prefix: 'membership.' },
  ];
  return (
    <>
      <PageHeader title="Settings" description="Every change is recorded in the audit log." />
      <div className="max-w-2xl space-y-4">
        {groups.map((g) => (
          <Card key={g.title} className="space-y-5">
            <h2 className="font-semibold">{g.title}</h2>
            {q.data.fields.filter((f) => f.key.startsWith(g.prefix)).map((f) => (
              <SettingRow key={f.key} field={f} value={q.data.values[f.key] ?? ''} canEdit={can('settings.manage')} />
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}
