import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api } from '@/lib/api';
import type { RoleInfo } from '../types';

export function RolesPage() {
  const q = useQuery({
    queryKey: ['admin', 'roles-full'],
    queryFn: () => api<{ data: { roles: RoleInfo[]; permissions: Record<string, string> } }>('/admin/roles').then((r) => r.data),
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">Could not load roles.</Alert>;
  const { roles, permissions } = q.data;
  return (
    <>
      <PageHeader title="Roles" description="Assign roles from a user's page. Permission sets are defined in code and reviewed with Andy." />
      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.key}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{r.name}</h2>
                <p className="text-sm text-ink-500">{r.description}</p>
              </div>
              <Badge>{r.userCount} {r.userCount === 1 ? 'user' : 'users'}</Badge>
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {r.permissions.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="text-success-500" aria-hidden>✓</span>
                  {permissions[p] ?? p}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
