import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, SelectField, TextAreaField } from '@/components/ui/Field';
import { useApiForm } from '@/features/auth/useApiForm';
import { MY_STATES, type MerchantView } from './types';

const Schema = z.object({
  name: z.string().trim().min(2, 'Enter the business name').max(150),
  businessType: z.string().trim().min(2, 'Enter the type of business').max(80),
  ssmNo: z.string().trim().max(40),
  description: z.string().trim().max(3000),
  phone: z.string().trim().max(20),
  email: z.string().trim().max(191),
  website: z.string().trim().max(255),
  addressLine1: z.string().trim().max(200),
  addressLine2: z.string().trim().max(200),
  city: z.string().trim().max(100),
  state: z.string(),
  postcode: z.string().trim().max(5),
});
export type ApplicationValues = z.infer<typeof Schema>;

const blank = (v: string | null | undefined) => v ?? '';

/** Business details form, used to create and to edit an application. Saving never submits it. */
export function ApplicationForm({ initial, onSave, saveLabel }: { initial?: MerchantView; onSave: (v: ApplicationValues) => Promise<void>; saveLabel: string }) {
  const { form, formError, submit } = useApiForm(Schema, {
    name: blank(initial?.name),
    businessType: blank(initial?.businessType),
    ssmNo: blank(initial?.ssmNo),
    description: blank(initial?.description),
    phone: blank(initial?.phone),
    email: blank(initial?.email),
    website: blank(initial?.website),
    addressLine1: blank(initial?.addressLine1),
    addressLine2: blank(initial?.addressLine2),
    city: blank(initial?.city),
    state: blank(initial?.state),
    postcode: blank(initial?.postcode),
  });
  const err = (k: keyof ApplicationValues) => form.formState.errors[k]?.message;
  const reg = form.register;

  return (
    <form onSubmit={submit(onSave)} className="space-y-6" noValidate>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Business</legend>
        <Field label="Business name" autoComplete="organization" error={err('name')} {...reg('name')} className="sm:col-span-2" />
        <Field label="Type of business" placeholder="e.g. Tyres and servicing" error={err('businessType')} {...reg('businessType')} />
        <Field label="SSM registration no." placeholder="e.g. 202301012345" error={err('ssmNo')} {...reg('ssmNo')} />
        <TextAreaField label="About the business" hint="Shown on your public page once approved." error={err('description')} {...reg('description')} className="sm:col-span-2" />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Contact</legend>
        <Field label="Business phone" type="tel" autoComplete="tel" error={err('phone')} {...reg('phone')} />
        <Field label="Business email" type="email" autoComplete="email" error={err('email')} {...reg('email')} />
        <Field label="Website" type="url" placeholder="https://" error={err('website')} {...reg('website')} className="sm:col-span-2" />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Address</legend>
        <Field label="Address line 1" autoComplete="address-line1" error={err('addressLine1')} {...reg('addressLine1')} className="sm:col-span-2" />
        <Field label="Address line 2" autoComplete="address-line2" error={err('addressLine2')} {...reg('addressLine2')} className="sm:col-span-2" />
        <Field label="City" autoComplete="address-level2" error={err('city')} {...reg('city')} />
        <Field label="Postcode" inputMode="numeric" autoComplete="postal-code" error={err('postcode')} {...reg('postcode')} />
        <SelectField label="State" options={MY_STATES} placeholder="Choose a state" error={err('state')} {...reg('state')} className="sm:col-span-2" />
      </fieldset>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Saving…' : saveLabel}
      </Button>
    </form>
  );
}
