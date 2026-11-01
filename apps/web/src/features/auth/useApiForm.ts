import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type FieldValues, type Path } from 'react-hook-form';
import type { ZodType } from 'zod';
import { ApiError } from '@/lib/api';

/**
 * React Hook Form + the shared Zod schema, plus mapping of API errors:
 * field-level validation errors go to fields, anything else to `formError`.
 */
export function useApiForm<T extends FieldValues>(schema: ZodType<T, any>, defaultValues?: Partial<T>) {
  const form = useForm<T>({ resolver: zodResolver(schema as never) as never, defaultValues: defaultValues as never });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (fn: (values: T) => Promise<void>) =>
    form.handleSubmit(async (values) => {
      setFormError(null);
      try {
        await fn(values);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
          for (const issue of err.details as { path: (string | number)[]; message: string }[]) {
            form.setError(issue.path.join('.') as Path<T>, { message: issue.message });
          }
        } else {
          setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
        }
      }
    });

  return { form, formError, submit };
}
