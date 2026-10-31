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

interface SettingsData {
  values: Record<string, string | boolean>;
  fields: { key: string; label: string; type: 'string' | 'boolean' }[];
}

function SettingRow({ field, value, canEdit }: { field: SettingsData['fields'][number]; value: string | boolean; canEdit: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = useMutation({
    mutationFn: (v: string | boolean) => api(`/admin/settings/${field.key}`, { method: 'PUT', json: { value: v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
  const error = save.error instanceof ApiError ? save.error.message : save.isError ? 'Could not save' : undefined;

  if (field.type === 'boolean') {
    return (
      <label className="flex min-h-11 items-center justify-between gap-4">
        <span className="text-sm font-medium">{field.label}</span>
        <input
          type="checkbox"
          className="size-5 accent-accent-500"
          checked={!!draft}
          disabled={!canEdit || save.isPending}
          onChange={(e) => {
            setDraft(e.target.checked);
            save.mutate(e.target.checked);
          }}
        />
      </label>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(draft);
      }}
    >
      <Field className="flex-1" label={field.label} value={String(draft)} disabled={!canEdit} error={error} onChange={(e) => setDraft(e.target.value)} />
      {canEdit && (
        <Button type="submit" variant="secondary" disabled={draft === value || save.isPending}>
          Save
        </Button>
      )}
    </form>
  );
}

export function SettingsPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<{ data: SettingsData }>('/admin/settings').then((r) => r.data) });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">Could not load settings.</Alert>;
  return (
    <>
      <PageHeader title="Settings" description="Every change is recorded in the audit log. Membership, commission and withdrawal settings arrive once those rules are confirmed." />
      <Card className="max-w-2xl space-y-5">
        {q.data.fields.map((f) => (
          <SettingRow key={f.key} field={f} value={q.data.values[f.key] ?? ''} canEdit={can('settings.manage')} />
        ))}
      </Card>
    </>
  );
}
