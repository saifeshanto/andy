import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import type { Paged } from '../types';

function useCount(path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'count', path],
    queryFn: async () => (await api<Paged<unknown>>(`${path}${path.includes('?') ? '&' : '?'}pageSize=1`)).meta.total,
    enabled,
  });
}

export function AdminDashboardPage() {
  const { can } = useAuth();
  const users = useCount('/admin/users', can('users.read'));
  const unverified = useCount('/admin/users?status=PENDING_VERIFICATION', can('users.read'));
  const failedEmails = useCount('/admin/emails?status=FAILED', can('emails.read'));

  const tiles = [
    { label: 'Registered users', value: users.data, to: '/admin/users', show: can('users.read') },
    { label: 'Unverified emails', value: unverified.data, to: '/admin/users?status=PENDING_VERIFICATION', show: can('users.read') },
    { label: 'Failed emails', value: failedEmails.data, to: '/admin/emails?status=FAILED', show: can('emails.read') },
  ].filter((t) => t.show);

  return (
    <>
      <PageHeader title="Dashboard" description="Membership, revenue and commission figures arrive with their modules." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card className="transition-shadow hover:shadow-lg">
              <p className="text-sm text-ink-500">{t.label}</p>
              <p className="mt-2 font-display text-4xl font-bold tabular-nums">{t.value ?? '…'}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
