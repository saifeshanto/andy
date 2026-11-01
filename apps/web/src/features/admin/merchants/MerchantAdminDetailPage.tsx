import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { openPrivateFile } from '@/features/merchants/openPrivateFile';
import { documentLabel, merchantStatusLabel, merchantStatusTone, type MerchantView } from '@/features/merchants/types';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

type Detail = MerchantView & {
  applicant: { id: string; email: string; fullName: string } | null;
  staff: { role: string; status: string; user: { id?: string; email?: string; fullName?: string } }[];
  outlets: { id: string; name: string; city: string; state: string; isActive: boolean }[];
};
type Action = 'approve' | 'request-changes' | 'reject' | 'suspend' | 'reinstate';

export function MerchantAdminDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'merchant', id], queryFn: () => api<{ data: Detail }>(`/admin/merchants/${id}`).then((r) => r.data) });
  const [note, setNote] = useState('');
  const act = useMutation({
    mutationFn: (action: Action) => api(`/admin/merchants/${id}/${action}`, { method: 'POST', json: note.trim() ? { note } : {} }),
    onSuccess: () => {
      setNote('');
      void qc.invalidateQueries({ queryKey: ['admin', 'merchant', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
    },
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">Merchant not found.</Alert>;
  const m = q.data;
  const rows: [string, React.ReactNode][] = [
    ['Type of business', m.businessType],
    ['SSM no.', m.ssmNo || '—'],
    ['Phone', m.phone ?? '—'],
    ['Email', m.email ?? '—'],
    ['Website', m.website ? <a href={m.website} target="_blank" rel="noopener noreferrer nofollow" className="underline">{m.website}</a> : '—'],
    ['Address', [m.addressLine1, m.addressLine2, [m.postcode, m.city].filter(Boolean).join(' '), m.state].filter(Boolean).join(', ') || '—'],
    ['Applicant', m.applicant ? <Link to={`/admin/users/${m.applicant.id}`} className="underline">{m.applicant.fullName} ({m.applicant.email})</Link> : '—'],
    ['Submitted', formatDateTime(m.submittedAt)],
  ];
  const canReview = can('merchants.review') && m.status === 'SUBMITTED';
  const canManage = can('merchants.manage') && (m.status === 'APPROVED' || m.status === 'SUSPENDED');
  const needsNote = note.trim().length < 5;

  return (
    <>
      <Link to="/admin/merchants" className="text-sm text-ink-500 underline">← All merchants</Link>
      <PageHeader title={m.name} description={m.businessType} actions={<Badge tone={merchantStatusTone[m.status]}>{merchantStatusLabel[m.status]}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card flush className="divide-y divide-ink-100">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 px-6 py-3.5 text-sm sm:flex-row sm:justify-between sm:gap-4">
                <span className="text-ink-500">{k}</span>
                <span className="break-words sm:text-right">{v}</span>
              </div>
            ))}
          </Card>
          {m.description && (
            <Card>
              <h2 className="font-semibold">About</h2>
              <p className="mt-2 whitespace-pre-line text-ink-700">{m.description}</p>
            </Card>
          )}
          {m.outlets.length > 0 && (
            <Card>
              <h2 className="font-semibold">Outlets</h2>
              <ul className="mt-2 space-y-1 text-sm">{m.outlets.map((o) => <li key={o.id}>{o.name}, {o.city}, {o.state}{o.isActive ? '' : ' (closed)'}</li>)}</ul>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Documents</h2>
            {m.documents?.length ? (
              <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100">
                {m.documents.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => void openPrivateFile(d.url, d.name)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-ink-50">
                      <FileText className="size-5 shrink-0 text-ink-500" aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-medium">{documentLabel[d.type]}</span>
                        <span className="block truncate text-ink-500 underline">{d.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-500">No documents.</p>
            )}
          </Card>

          {(canReview || canManage) && (
            <Card>
              <h2 className="font-semibold">Decision</h2>
              {m.reviewNote && <p className="mt-1 text-sm text-ink-500">Last note: {m.reviewNote}</p>}
              <label htmlFor="note" className="mt-4 block text-sm font-medium">Note to the merchant</label>
              <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-ink-100 px-3.5 py-2.5" />
              <p className="mt-1 text-xs text-ink-500">Required to request changes, reject or suspend. Sent to the merchant by email and saved in the audit log.</p>
              {act.isError && <div className="mt-3"><Alert tone="danger">{act.error instanceof ApiError ? act.error.message : 'Something went wrong'}</Alert></div>}
              <div className="mt-4 flex flex-wrap gap-2">
                {canReview && (
                  <>
                    <Button disabled={act.isPending} onClick={() => act.mutate('approve')}>Approve</Button>
                    <Button variant="secondary" disabled={act.isPending || needsNote} onClick={() => act.mutate('request-changes')}>Request changes</Button>
                    <Button variant="danger" disabled={act.isPending || needsNote} onClick={() => act.mutate('reject')}>Reject</Button>
                  </>
                )}
                {canManage && m.status === 'APPROVED' && <Button variant="danger" disabled={act.isPending || needsNote} onClick={() => act.mutate('suspend')}>Suspend</Button>}
                {canManage && m.status === 'SUSPENDED' && <Button disabled={act.isPending} onClick={() => act.mutate('reinstate')}>Reinstate</Button>}
              </div>
            </Card>
          )}

          <Card>
            <h2 className="font-semibold">Staff</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {m.staff.map((s, i) => (
                <li key={i}>{s.user.id ? <Link to={`/admin/users/${s.user.id}`} className="underline">{s.user.fullName}</Link> : '—'} · {s.role.toLowerCase()}{s.status !== 'ACTIVE' ? ' (disabled)' : ''}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
