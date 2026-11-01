import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api, ApiError } from '@/lib/api';

interface Row { id: number; name: string; slug: string; sort: number; isActive: boolean; listings: number }

export function CategoriesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<{ data: Row[] }>('/admin/categories').then((r) => r.data) });
  const [name, setName] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
    void qc.invalidateQueries({ queryKey: ['public', 'categories'] });
  };
  const add = useMutation({
    mutationFn: () => api('/admin/categories', { method: 'POST', json: { name, sort: ((q.data?.at(-1)?.sort ?? 0) + 10) } }),
    onSuccess: () => {
      setName('');
      refresh();
    },
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: object }) => api(`/admin/categories/${id}`, { method: 'PATCH', json: body }), onSuccess: refresh });
  const error = add.error ?? patch.error;
  return (
    <>
      <PageHeader title="Categories" description="Shown in the marketplace filters. Hidden categories cannot be picked for new listings." />
      {error && <div className="mb-4"><Alert tone="danger">{error instanceof ApiError ? error.message : 'Something went wrong'}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card flush className="divide-y divide-ink-100">
          {q.isLoading && <div className="p-6"><Spinner /></div>}
          {q.data?.map((c) => (
            <div key={c.id} className={`flex flex-wrap items-center gap-3 px-6 py-3 ${c.isActive ? '' : 'opacity-60'}`}>
              <input
                aria-label={`Name of ${c.name}`}
                defaultValue={c.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && patch.mutate({ id: c.id, body: { name: e.target.value.trim() } })}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-transparent px-2 hover:border-ink-100 focus:border-ink-100"
              />
              <span className="text-sm text-ink-500">{c.listings} listings</span>
              <Button variant="secondary" onClick={() => patch.mutate({ id: c.id, body: { isActive: !c.isActive } })}>{c.isActive ? 'Hide' : 'Show'}</Button>
            </div>
          ))}
        </Card>
        <Card>
          <h2 className="font-semibold">Add a category</h2>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <input aria-label="Category name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Windscreen" className="min-h-11 min-w-0 flex-1 rounded-xl border border-ink-100 px-3.5" />
            <Button type="submit" disabled={name.trim().length < 2 || add.isPending}>Add</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
