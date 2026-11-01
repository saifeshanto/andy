import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageArgs({ page, pageSize }: z.infer<typeof PaginationSchema>) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta({ page, pageSize }: z.infer<typeof PaginationSchema>, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** BigInt-safe id parsing for route params. */
export const IdParam = z.object({ id: z.string().regex(/^\d{1,19}$/).transform((v) => BigInt(v)) });
