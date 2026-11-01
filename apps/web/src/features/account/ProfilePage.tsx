import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  const rows: [string, string][] = [
    ['Full name', user.fullName],
    ['Email', user.email],
    ['Phone', user.phone ?? '—'],
  ];
  return (
    <>
      <PageHeader title="Profile" description="Editing your profile arrives with the members module." />
      <Card flush className="max-w-xl divide-y divide-ink-100">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-6 py-4">
            <span className="text-ink-500">{k}</span>
            <span className="text-right font-medium break-all">{v}</span>
          </div>
        ))}
      </Card>
    </>
  );
}
