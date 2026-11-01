import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, TextAreaField } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { toRM, toSen } from '@/features/listings/types';
import { campaignStatusLabel, campaignStatusTone, endOfDayMYT, startOfDayMYT, toDateInput, type BenefitType, type CampaignView } from '@/features/vouchers/types';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useOutlets } from './OutletsPage';
import { portalKey, usePortal } from './PortalContext';

interface FormState {
  title: string;
  terms: string;
  benefitType: BenefitType;
  amount: string;
  percent: string;
  memberOnly: boolean;
  totalQty: string;
  perUserLimit: string;
  claimStart: string;
  claimEnd: string;
  validUntil: string;
  validDays: string;
  outletIds: string[];
}

const BENEFITS: { value: BenefitType; label: string }[] = [
  { value: 'FREE_ITEM', label: 'Something free' },
  { value: 'FIXED_OFF', label: 'RM off' },
  { value: 'PERCENT_OFF', label: '% off' },
];

function fromCampaign(c?: CampaignView): FormState {
  return {
    title: c?.title ?? '',
    terms: c?.terms ?? '',
    benefitType: c?.benefitType ?? 'FREE_ITEM',
    amount: c?.benefitType === 'FIXED_OFF' ? toRM(c.benefitValue) : '',
    percent: c?.benefitType === 'PERCENT_OFF' && c.benefitValue ? String(c.benefitValue) : '',
    memberOnly: c?.memberOnly ?? true,
    totalQty: c?.totalQty == null ? '' : String(c.totalQty),
    perUserLimit: String(c?.perUserLimit ?? 1),
    claimStart: toDateInput(c?.claimStartAt),
    claimEnd: toDateInput(c?.claimEndAt),
    validUntil: toDateInput(c?.validUntil),
    validDays: c?.validDays == null ? '' : String(c.validDays),
    outletIds: c?.outletIds ?? [],
  };
}

const FIELD_OF: Record<string, string> = { benefitValue: 'benefit', claimEndAt: 'claimEnd', claimStartAt: 'claimStart', validUntil: 'validUntil', totalQty: 'totalQty' };

export function VoucherEditorPage() {
  const { campaignId } = useParams();
  const isNew = !campaignId;
  const { id, base } = usePortal();
  const q = useQuery({
    queryKey: ['merchant-portal', id, 'voucher', campaignId],
    queryFn: () => api<{ data: CampaignView }>(`/merchant/${id}/vouchers/${campaignId}`).then((r) => r.data),
    enabled: !isNew,
  });
  if (!isNew && q.isLoading) return <Spinner />;
  if (!isNew && (q.isError || !q.data)) return <Alert tone="danger">Voucher not found.</Alert>;
  return (
    <>
      <Link to={`${base}/vouchers`} className="inline-flex items-center gap-1 text-sm text-ink-500 underline"><ArrowLeft className="size-4" aria-hidden /> All vouchers</Link>
      <Editor key={q.data?.updatedAt ?? 'new'} campaign={q.data} />
    </>
  );
}

function Editor({ campaign }: { campaign?: CampaignView }) {
  const { id, base, can, merchant } = usePortal();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const outlets = useOutlets(id);
  const [f, setF] = useState<FormState>(() => fromCampaign(campaign));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const status = campaign?.status;
  const live = status === 'APPROVED' || status === 'PAUSED';
  const manage = can('vouchers.manage') && merchant.status === 'APPROVED';
  const locked = !manage || status === 'PENDING' || status === 'ENDED';
  const termsLocked = locked || live;

  const refresh = async (c?: CampaignView) => {
    await qc.invalidateQueries({ queryKey: ['merchant-portal', id, 'vouchers'] });
    await qc.invalidateQueries({ queryKey: portalKey(id) });
    if (c) qc.setQueryData(['merchant-portal', id, 'voucher', c.id], c);
  };

  const body = () => {
    const e: Record<string, string> = {};
    const qty = f.totalQty.trim() ? Number(f.totalQty) : null;
    if (live) {
      if (qty != null && qty < (campaign?.claimedCount ?? 0)) e.totalQty = `Must be at least ${campaign?.claimedCount}, the number already claimed`;
      setErrors(e);
      return Object.keys(e).length ? null : { totalQty: qty, outletIds: f.outletIds };
    }
    const amount = f.benefitType === 'FIXED_OFF' ? toSen(f.amount) : null;
    const percent = f.benefitType === 'PERCENT_OFF' ? Number(f.percent) : null;
    if (f.title.trim().length < 3) e.title = 'Enter a title';
    if (f.terms.trim().length < 10) e.terms = 'Write the terms in at least 10 characters';
    if (f.benefitType === 'FIXED_OFF' && !amount) e.benefit = 'Enter the amount off, e.g. 20';
    if (f.benefitType === 'PERCENT_OFF' && !(percent && percent >= 1 && percent <= 100)) e.benefit = 'Enter a percentage from 1 to 100';
    if (!f.claimEnd) e.claimEnd = 'Choose the last day to claim';
    if (!f.validUntil) e.validUntil = 'Choose the last day it can be used';
    if (f.claimEnd && f.validUntil && f.validUntil < f.claimEnd) e.validUntil = 'Must be on or after the last claim day';
    if (f.claimStart && f.claimEnd && f.claimStart > f.claimEnd) e.claimEnd = 'Must be after the first claim day';
    const limit = Number(f.perUserLimit);
    if (!(limit >= 1 && limit <= 100)) e.perUserLimit = 'From 1 to 100';
    setErrors(e);
    if (Object.keys(e).length) return null;
    return {
      title: f.title.trim(),
      terms: f.terms.trim(),
      benefitType: f.benefitType,
      benefitValue: f.benefitType === 'FIXED_OFF' ? amount : f.benefitType === 'PERCENT_OFF' ? percent : null,
      memberOnly: f.memberOnly,
      totalQty: qty,
      perUserLimit: limit,
      claimStartAt: f.claimStart ? startOfDayMYT(f.claimStart) : null,
      claimEndAt: endOfDayMYT(f.claimEnd),
      validUntil: endOfDayMYT(f.validUntil),
      validDays: f.validDays.trim() ? Number(f.validDays) : null,
      outletIds: f.outletIds,
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      const b = body();
      if (!b) throw new Error('invalid');
      const url = campaign ? `/merchant/${id}/vouchers/${campaign.id}` : `/merchant/${id}/vouchers`;
      return api<{ data: CampaignView }>(url, { method: campaign ? 'PATCH' : 'POST', json: b }).then((r) => r.data);
    },
    onMutate: () => {
      setFormError(null);
      setSaved(null);
    },
    onSuccess: async (c) => {
      await refresh(c);
      if (!campaign) navigate(`${base}/vouchers/${c.id}`, { replace: true });
      setSaved('Saved.');
    },
    onError: (err) => {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setErrors(Object.fromEntries((err.details as { path: string[]; message: string }[]).map((d) => [FIELD_OF[d.path[0]!] ?? d.path[0]!, d.message])));
      }
      if (err instanceof ApiError) setFormError(err.message);
    },
  });
  const action = useMutation({
    mutationFn: (a: 'submit' | 'pause' | 'resume' | 'end') => api<{ data: CampaignView }>(`/merchant/${id}/vouchers/${campaign!.id}/${a}`, { method: 'POST' }).then((r) => r.data),
    onSuccess: (c) => refresh(c),
  });

  const activeOutlets = (outlets.data ?? []).filter((o) => o.isActive || f.outletIds.includes(o.id));
  const actionError = action.error instanceof ApiError ? action.error.message : action.error ? 'Something went wrong' : null;

  return (
    <div className="mt-2">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{campaign ? campaign.title : 'New voucher'}</h1>
        {status && <Badge tone={campaignStatusTone[status]}>{campaignStatusLabel[status]}</Badge>}
      </div>
      {status === 'REJECTED' && campaign?.reviewNote && <div className="mb-4"><Alert tone="danger"><strong>Not approved:</strong> {campaign.reviewNote} Edit and send it again.</Alert></div>}
      {status === 'PENDING' && <div className="mb-4"><Alert tone="warning">Waiting for approval. You can edit it again after the review.</Alert></div>}
      {live && <div className="mb-4"><Alert tone="info">Members have claimed this voucher under these terms, so only the quantity and outlets can change. For different terms, end it and create a new one.</Alert></div>}
      {campaign && status !== 'DRAFT' && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            ['Claimed', `${campaign.claimedCount}${campaign.totalQty != null ? ` / ${campaign.totalQty}` : ''}`],
            ['Used', String(campaign.redeemedCount)],
            ['Claim by', formatDateTime(campaign.claimEndAt).split(',')[0]!],
          ].map(([k, v]) => (
            <Card key={k}><p className="text-xs uppercase tracking-wide text-ink-500">{k}</p><p className="mt-1 font-display text-2xl font-bold">{v}</p></Card>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <fieldset disabled={termsLocked} className="space-y-4">
            <Field label="Title" value={f.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="e.g. Free premium car wash" />
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-800">What the member gets</p>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What the member gets">
                {BENEFITS.map((b) => (
                  <label key={b.value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold ${f.benefitType === b.value ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-100'}`}>
                    <input type="radio" name="benefit" value={b.value} checked={f.benefitType === b.value} onChange={() => set('benefitType', b.value)} className="sr-only" />
                    {b.label}
                  </label>
                ))}
              </div>
            </div>
            {f.benefitType === 'FIXED_OFF' && <Field label="Amount off (RM)" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} error={errors.benefit} placeholder="e.g. 20" />}
            {f.benefitType === 'PERCENT_OFF' && <Field label="Percent off" inputMode="numeric" value={f.percent} onChange={(e) => set('percent', e.target.value.replace(/\D/g, ''))} error={errors.benefit} placeholder="e.g. 15" />}
            <TextAreaField label="Terms" rows={5} value={f.terms} onChange={(e) => set('terms', e.target.value)} error={errors.terms} hint="What is included, which cars or items, any minimum spend. Members and your cashiers see this." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First day to claim" type="date" value={f.claimStart} onChange={(e) => set('claimStart', e.target.value)} error={errors.claimStart} hint="Leave empty to start as soon as it is approved." />
              <Field label="Last day to claim" type="date" value={f.claimEnd} onChange={(e) => set('claimEnd', e.target.value)} error={errors.claimEnd} />
              <Field label="Last day it can be used" type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} error={errors.validUntil} />
              <Field label="Or valid for (days after claiming)" inputMode="numeric" value={f.validDays} onChange={(e) => set('validDays', e.target.value.replace(/\D/g, ''))} placeholder="Optional" hint="Whichever comes first applies." />
              <Field label="Per member" inputMode="numeric" value={f.perUserLimit} onChange={(e) => set('perUserLimit', e.target.value.replace(/\D/g, ''))} error={errors.perUserLimit} hint="How many each member can claim." />
            </div>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="size-4 accent-accent-500" checked={f.memberOnly} onChange={(e) => set('memberOnly', e.target.checked)} />
              <span className="text-sm">Members only <span className="text-ink-500">(membership must be active when claiming and when using it)</span></span>
            </label>
          </fieldset>
        </Card>
        <div className="space-y-4">
          <Card>
            <fieldset disabled={locked} className="space-y-4">
              <Field label="Total available" inputMode="numeric" value={f.totalQty} onChange={(e) => set('totalQty', e.target.value.replace(/\D/g, ''))} error={errors.totalQty} placeholder="Unlimited" hint="Leave empty for no limit." />
              <div>
                <h2 className="font-semibold">Where it can be used</h2>
                <div className="mt-2 space-y-1">
                  {activeOutlets.map((o) => (
                    <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-ink-50">
                      <input type="checkbox" className="size-4 accent-accent-500" checked={f.outletIds.includes(o.id)} onChange={(e) => set('outletIds', e.target.checked ? [...f.outletIds, o.id] : f.outletIds.filter((x) => x !== o.id))} />
                      <span className="text-sm">{o.name} <span className="text-ink-500">· {o.city}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>
          </Card>
          {formError && formError !== 'invalid' && <Alert tone="danger">{formError}</Alert>}
          {actionError && <Alert tone="danger">{actionError}</Alert>}
          {saved && <Alert tone="success">{saved}</Alert>}
          {!locked && (
            <Card>
              {campaign && (status === 'DRAFT' || status === 'REJECTED') && campaign.missing && campaign.missing.length > 0 && (
                <p className="mb-3 text-sm text-ink-500">Before sending for approval, add: {campaign.missing.join(', ').toLowerCase()}.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : live ? 'Save changes' : 'Save draft'}</Button>
                {campaign && (status === 'DRAFT' || status === 'REJECTED') && (
                  <Button variant="secondary" disabled={action.isPending || !!campaign.missing?.length} onClick={() => action.mutate('submit')}>Send for approval</Button>
                )}
                {status === 'APPROVED' && <Button variant="secondary" disabled={action.isPending} onClick={() => action.mutate('pause')}>Pause claiming</Button>}
                {status === 'PAUSED' && <Button variant="secondary" disabled={action.isPending} onClick={() => action.mutate('resume')}>Resume claiming</Button>}
                {campaign && <Button variant="ghost" disabled={action.isPending} onClick={() => action.mutate('end')}>End voucher</Button>}
              </div>
              {live && <p className="mt-3 text-xs text-ink-500">Pausing or ending only stops new claims. Vouchers members already have can still be used until they expire.</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
