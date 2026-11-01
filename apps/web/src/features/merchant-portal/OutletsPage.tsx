import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField, TextAreaField } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useApiForm } from '@/features/auth/useApiForm';
import { MY_STATES } from '@/features/merchants/types';
import { api } from '@/lib/api';
import { portalKey, usePortal } from './PortalContext';

export interface Outlet {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postcode: string;
  phone: string | null;
  hours: string | null;
  isActive: boolean;
}

const Schema = z.object({
  name: z.string().trim().min(2, 'Enter the outlet name'),
  addressLine1: z.string().trim().min(3, 'Enter the address'),
  addressLine2: z.string(),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().min(1, 'Choose a state'),
  postcode: z.string().trim().regex(/^\d{5}$/, 'Postcode is 5 digits'),
  phone: z.string(),
  hours: z.string(),
});

export const useOutlets = (id: string) => useQuery({ queryKey: ['merchant-portal', id, 'outlets'], queryFn: () => api<{ data: Outlet[] }>(`/merchant/${id}/outlets`).then((r) => r.data) });

export function OutletsPage() {
  const { id, can, merchant } = usePortal();
  const qc = useQueryClient();
  const q = useOutlets(id);
  const [editing, setEditing] = useState<Outlet | 'new' | null>(null);
  const canEdit = can('outlets.manage') && merchant.status === 'APPROVED';
  const done = async () => {
    setEditing(null);
    await qc.invalidateQueries({ queryKey: ['merchant-portal', id, 'outlets'] });
    await qc.invalidateQueries({ queryKey: portalKey(id) });
  };
  const toggle = async (o: Outlet) => {
    await api(`/merchant/${id}/outlets/${o.id}`, { method: 'PATCH', json: { isActive: !o.isActive } });
    await done();
  };

  return (
    <>
      <PageHeader title="Outlets" description="Branches where members can find you." actions={canEdit && editing === null ? <Button onClick={() => setEditing('new')}>Add outlet</Button> : null} />
      {editing && <OutletForm key={editing === 'new' ? 'new' : editing.id} outlet={editing === 'new' ? undefined : editing} merchantId={id} onDone={done} onCancel={() => setEditing(null)} />}
      {q.isLoading && <Spinner />}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {q.data?.map((o) => (
          <Card key={o.id} className={o.isActive ? '' : 'opacity-70'}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-accent-500" aria-hidden />
                <div>
                  <h2 className="font-semibold">{o.name}</h2>
                  <p className="mt-1 text-sm text-ink-500">{[o.addressLine1, o.addressLine2, `${o.postcode} ${o.city}`, o.state].filter(Boolean).join(', ')}</p>
                  {o.phone && <p className="mt-1 text-sm">{o.phone}</p>}
                  {o.hours && <p className="mt-1 whitespace-pre-line text-sm text-ink-500">{o.hours}</p>}
                </div>
              </div>
              {!o.isActive && <Badge>Closed</Badge>}
            </div>
            {canEdit && (
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(o)}>Edit</Button>
                <Button variant="secondary" onClick={() => void toggle(o)}>{o.isActive ? 'Mark closed' : 'Reopen'}</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

function OutletForm({ outlet, merchantId, onDone, onCancel }: { outlet?: Outlet; merchantId: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const { form, formError, submit } = useApiForm(Schema, {
    name: outlet?.name ?? '',
    addressLine1: outlet?.addressLine1 ?? '',
    addressLine2: outlet?.addressLine2 ?? '',
    city: outlet?.city ?? '',
    state: outlet?.state ?? '',
    postcode: outlet?.postcode ?? '',
    phone: outlet?.phone ?? '',
    hours: outlet?.hours ?? '',
  });
  const err = (k: keyof z.infer<typeof Schema>) => form.formState.errors[k]?.message;
  const onSave = submit(async (v) => {
    await api(outlet ? `/merchant/${merchantId}/outlets/${outlet.id}` : `/merchant/${merchantId}/outlets`, { method: outlet ? 'PATCH' : 'POST', json: v });
    await onDone();
  });
  return (
    <Card>
      <h2 className="font-semibold">{outlet ? `Edit ${outlet.name}` : 'New outlet'}</h2>
      <form onSubmit={onSave} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Outlet name" placeholder="e.g. Petaling Jaya branch" error={err('name')} {...form.register('name')} className="sm:col-span-2" />
        <Field label="Address line 1" error={err('addressLine1')} {...form.register('addressLine1')} className="sm:col-span-2" />
        <Field label="Address line 2" error={err('addressLine2')} {...form.register('addressLine2')} className="sm:col-span-2" />
        <Field label="City" error={err('city')} {...form.register('city')} />
        <Field label="Postcode" inputMode="numeric" error={err('postcode')} {...form.register('postcode')} />
        <SelectField label="State" options={MY_STATES} placeholder="Choose a state" error={err('state')} {...form.register('state')} />
        <Field label="Phone" type="tel" error={err('phone')} {...form.register('phone')} />
        <TextAreaField label="Opening hours" rows={3} placeholder={'Mon–Fri 9am–6pm\nSat 9am–1pm'} error={err('hours')} {...form.register('hours')} className="sm:col-span-2" />
        {formError && <div className="sm:col-span-2"><Alert tone="danger">{formError}</Alert></div>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Saving…' : 'Save outlet'}</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
