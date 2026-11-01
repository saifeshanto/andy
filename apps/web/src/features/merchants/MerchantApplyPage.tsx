import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ApplicationForm, type ApplicationValues } from './ApplicationForm';
import { DocumentsCard } from './DocumentsCard';
import { merchantStatusLabel, merchantStatusTone, type MerchantView } from './types';

type Seat = { role: 'OWNER' | 'MANAGER' | 'CASHIER'; merchant: MerchantView };

/** The application to show: the newest one that is still going, or else the newest rejected one. */
function pick(seats: Seat[]): MerchantView | undefined {
  const owned = seats.filter((s) => s.role === 'OWNER').map((s) => s.merchant).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return owned.find((m) => m.status !== 'REJECTED') ?? owned[0];
}

export function MerchantApplyPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const seats = useQuery({ queryKey: ['me', 'merchants'], queryFn: () => api<{ data: Seat[] }>('/me/merchants').then((r) => r.data) });
  const current = seats.data ? pick(seats.data) : undefined;
  const [startOver, setStartOver] = useState(false);

  const detail = useQuery({
    queryKey: ['merchant-application', current?.id],
    queryFn: () => api<{ data: MerchantView }>(`/merchant-applications/${current!.id}`).then((r) => r.data),
    enabled: !!current && !startOver,
  });
  const setDetail = (m: MerchantView) => {
    qc.setQueryData(['merchant-application', m.id], m);
    void qc.invalidateQueries({ queryKey: ['me', 'merchants'] });
  };

  const create = async (v: ApplicationValues) => {
    const m = await api<{ data: MerchantView }>('/merchant-applications', { method: 'POST', json: v }).then((r) => r.data);
    setStartOver(false);
    setDetail(m);
  };
  const save = async (v: ApplicationValues) => {
    setDetail(await api<{ data: MerchantView }>(`/merchant-applications/${current!.id}`, { method: 'PATCH', json: v }).then((r) => r.data));
  };
  const submit = useMutation({
    mutationFn: () => api<{ data: MerchantView }>(`/merchant-applications/${current!.id}/submit`, { method: 'POST' }).then((r) => r.data),
    onSuccess: setDetail,
  });

  if (seats.isLoading || detail.isLoading) return <Shell><Spinner /></Shell>;
  if (seats.isError) return <Shell><Alert tone="danger">Could not load your application.</Alert></Shell>;
  if (user?.status !== 'ACTIVE') {
    return (
      <Shell>
        <Alert tone="warning">Please confirm your email address first. We sent you a link when you registered.</Alert>
      </Shell>
    );
  }

  if (!current || startOver) {
    return (
      <Shell intro>
        <Card>
          <ApplicationForm onSave={create} saveLabel="Save and continue" />
        </Card>
      </Shell>
    );
  }

  const app = detail.data ?? current;
  const editable = app.status === 'DRAFT' || app.status === 'CHANGES_REQUESTED';

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">{app.name}</h2>
        <Badge tone={merchantStatusTone[app.status]}>{merchantStatusLabel[app.status]}</Badge>
      </div>

      {app.status === 'SUBMITTED' && (
        <StatusCard icon={<Clock className="size-6 text-warning-500" aria-hidden />} title="We are reviewing your application">
          Submitted {formatDateTime(app.submittedAt)}. We will email you when there is a decision.
        </StatusCard>
      )}
      {(app.status === 'APPROVED' || app.status === 'SUSPENDED') && (
        <StatusCard icon={<CheckCircle2 className="size-6 text-success-500" aria-hidden />} title={app.status === 'APPROVED' ? 'Your business is approved' : 'Your business is suspended'}>
          {app.status === 'SUSPENDED' && app.reviewNote ? <>{app.reviewNote} </> : null}
          <Link to="/merchant" className="font-semibold underline">Open the merchant portal</Link>
        </StatusCard>
      )}
      {app.status === 'REJECTED' && (
        <Card>
          <h3 className="font-semibold">We could not approve this application</h3>
          {app.reviewNote && <p className="mt-2 text-ink-500">{app.reviewNote}</p>}
          <Button className="mt-4" onClick={() => setStartOver(true)}>Start a new application</Button>
        </Card>
      )}

      {editable && (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-4">
            {app.status === 'CHANGES_REQUESTED' && app.reviewNote && <Alert tone="warning"><strong>Changes requested:</strong> {app.reviewNote}</Alert>}
            <Card>
              <ApplicationForm key={app.id} initial={app} onSave={save} saveLabel="Save changes" />
            </Card>
          </div>
          <div className="space-y-4">
            <DocumentsCard app={app} editable onChange={setDetail} />
            <Card>
              <h2 className="font-semibold">Submit for review</h2>
              {app.missing && app.missing.length > 0 ? (
                <>
                  <p className="mt-1 text-sm text-ink-500">Still needed:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {app.missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-sm text-ink-500">Everything needed is in. You cannot edit the application while we review it.</p>
              )}
              {submit.isError && <div className="mt-3"><Alert tone="danger">{submit.error instanceof ApiError ? submit.error.message : 'Could not submit'}</Alert></div>}
              <Button className="mt-4 w-full" disabled={!!app.missing?.length || submit.isPending} onClick={() => submit.mutate()}>
                {submit.isPending ? 'Submitting…' : 'Submit application'}
              </Button>
            </Card>
          </div>
        </div>
      )}
      {!editable && app.documents && app.documents.length > 0 && app.status === 'SUBMITTED' && (
        <div className="mt-4"><DocumentsCard app={app} editable={false} onChange={setDetail} /></div>
      )}
    </Shell>
  );
}

function Shell({ children, intro }: { children: React.ReactNode; intro?: boolean }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent-500">For businesses</p>
      <h1 className="mt-1 font-display text-4xl font-bold uppercase">Become a merchant</h1>
      {intro && (
        <p className="mt-2 max-w-2xl text-ink-500">
          List your products and services for Andy Auto Club members. Tell us about your business; you can save and come back before submitting. You will need your SSM registration certificate.
        </p>
      )}
      <div className="mt-6">{children}</div>
    </main>
  );
}

function StatusCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="flex gap-4">
      {icon}
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-ink-500">{children}</p>
      </div>
    </Card>
  );
}
