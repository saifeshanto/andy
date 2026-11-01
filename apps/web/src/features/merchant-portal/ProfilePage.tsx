import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, TextAreaField } from '@/components/ui/Field';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useApiForm } from '@/features/auth/useApiForm';
import { api, ApiError, uploadFile } from '@/lib/api';
import { portalKey, usePortal } from './PortalContext';

const Schema = z.object({
  description: z.string().max(3000),
  phone: z.string().max(20),
  email: z.string().max(191),
  website: z.string().max(255),
});

export function PortalProfilePage() {
  const { merchant, id } = usePortal();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: portalKey(id) });
  const [saved, setSaved] = useState(false);
  const { form, formError, submit } = useApiForm(Schema, {
    description: merchant.description ?? '',
    phone: merchant.phone ?? '',
    email: merchant.email ?? '',
    website: merchant.website ?? '',
  });
  const onSave = submit(async (v) => {
    setSaved(false);
    await api(`/merchant/${id}/profile`, { method: 'PATCH', json: v });
    await refresh();
    setSaved(true);
  });

  const logoInput = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const setLogo = async (file: File | null) => {
    setLogoBusy(true);
    setLogoError(null);
    try {
      const logoFileId = file ? (await uploadFile(file, 'MERCHANT_LOGO')).id : null;
      await api(`/merchant/${id}/profile`, { method: 'PATCH', json: { logoFileId } });
      await refresh();
    } catch (err) {
      setLogoError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setLogoBusy(false);
      if (logoInput.current) logoInput.current.value = '';
    }
  };
  const err = (k: keyof z.infer<typeof Schema>) => form.formState.errors[k]?.message;

  return (
    <>
      <PageHeader title="Business profile" description="What members see on your page in the marketplace." />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <form onSubmit={onSave} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name" value={merchant.name} disabled hint="Contact us to change your registered name." />
              <Field label="SSM no." value={merchant.ssmNo} disabled />
            </div>
            <TextAreaField label="About the business" rows={5} error={err('description')} {...form.register('description')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" type="tel" error={err('phone')} {...form.register('phone')} />
              <Field label="Email" type="email" error={err('email')} {...form.register('email')} />
            </div>
            <Field label="Website" type="url" placeholder="https://" error={err('website')} {...form.register('website')} />
            {formError && <Alert tone="danger">{formError}</Alert>}
            {saved && <Alert tone="success">Saved.</Alert>}
            <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Saving…' : 'Save profile'}</Button>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold">Logo</h2>
          <p className="mt-1 text-sm text-ink-500">Square JPG, PNG or WebP, up to 2 MB.</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink-50 text-3xl font-bold text-ink-300">
              {merchant.logo ? <img src={merchant.logo.url} alt={`${merchant.name} logo`} className="size-full object-cover" /> : merchant.name.slice(0, 1)}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="logo" onChange={(e) => e.target.files?.[0] && void setLogo(e.target.files[0])} />
              <Button type="button" variant="secondary" disabled={logoBusy} onClick={() => logoInput.current?.click()}>{logoBusy ? 'Uploading…' : merchant.logo ? 'Replace logo' : 'Upload logo'}</Button>
              {merchant.logo && <button type="button" className="text-sm text-ink-500 underline" disabled={logoBusy} onClick={() => void setLogo(null)}>Remove</button>}
            </div>
          </div>
          {logoError && <div className="mt-3"><Alert tone="danger">{logoError}</Alert></div>}
        </Card>
      </div>
    </>
  );
}
