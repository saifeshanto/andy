import { useMutation } from '@tanstack/react-query';
import { FileText, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/Field';
import { api, ApiError, uploadFile } from '@/lib/api';
import { openPrivateFile } from './openPrivateFile';
import { documentLabel, type DocumentType, type MerchantView } from './types';

const TYPES = Object.entries(documentLabel).map(([value, label]) => ({ value, label }));

/** Upload and remove supporting documents while an application is editable. */
export function DocumentsCard({ app, editable, onChange }: { app: MerchantView; editable: boolean; onChange: (m: MerchantView) => void }) {
  const [type, setType] = useState<DocumentType>('SSM_CERTIFICATE');
  const input = useRef<HTMLInputElement>(null);
  const add = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadFile(file, 'MERCHANT_DOCUMENT');
      return api<{ data: MerchantView }>(`/merchant-applications/${app.id}/documents`, { method: 'POST', json: { type, fileId: uploaded.id } }).then((r) => r.data);
    },
    onSuccess: onChange,
    onSettled: () => {
      if (input.current) input.current.value = '';
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api(`/merchant-applications/${app.id}/documents/${id}`, { method: 'DELETE' });
      return api<{ data: MerchantView }>(`/merchant-applications/${app.id}`).then((r) => r.data);
    },
    onSuccess: onChange,
  });
  const docs = app.documents ?? [];
  const error = add.error ?? remove.error;

  return (
    <Card>
      <h2 className="font-semibold">Documents</h2>
      <p className="mt-1 text-sm text-ink-500">The SSM certificate is required. JPG, PNG or PDF, up to 5 MB each. Only our review team can see these.</p>
      {docs.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <FileText className="size-5 shrink-0 text-ink-500" aria-hidden />
              <button type="button" onClick={() => void openPrivateFile(d.url, d.name)} className="min-w-0 flex-1 text-left">
                <span className="block font-medium">{documentLabel[d.type]}</span>
                <span className="block truncate text-ink-500 underline">{d.name}</span>
              </button>
              {editable && (
                <button type="button" aria-label={`Remove ${d.name}`} onClick={() => remove.mutate(d.id)} disabled={remove.isPending} className="grid size-11 place-items-center rounded-full text-ink-500 hover:bg-ink-50 hover:text-danger-500">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectField label="Document type" options={TYPES} value={type} onChange={(e) => setType(e.target.value as DocumentType)} className="sm:flex-1" />
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" id="doc-upload" onChange={(e) => e.target.files?.[0] && add.mutate(e.target.files[0])} />
          <Button type="button" variant="secondary" disabled={add.isPending} onClick={() => input.current?.click()}>
            {add.isPending ? 'Uploading…' : 'Upload file'}
          </Button>
        </div>
      )}
      {error && <div className="mt-3"><Alert tone="danger">{error instanceof ApiError ? error.message : 'Upload failed'}</Alert></div>}
    </Card>
  );
}
