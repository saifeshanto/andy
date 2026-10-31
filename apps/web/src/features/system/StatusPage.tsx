import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useHealth } from './api';

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Kuala_Lumpur' }).format(
    new Date(iso),
  );

/** Phase 0 Hostinger test page: shows web, API, database and cron are all working. */
export function StatusPage() {
  const { data, isLoading, isError } = useHealth();

  const rows: [string, boolean | null, string][] = [
    ['Website', true, 'This page loaded from the Node.js app'],
    ['API', isLoading ? null : !isError && !!data, data ? `Node ${data.node}, up ${data.uptimeSeconds}s` : 'No response'],
    ['Database', data ? data.database.ok : null, data?.database.version ?? data?.database.error ?? 'Checking'],
    [
      'Cron',
      data ? !!data.cron.lastHeartbeatAt : null,
      data?.cron.lastHeartbeatAt ? `Last heartbeat ${fmt(data.cron.lastHeartbeatAt)}` : 'No heartbeat yet',
    ],
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">System status</h1>
      <Card className="mt-6 divide-y divide-ink-100 p-0">
        {rows.map(([label, ok, detail]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-6 py-4">
            <div>
              <p className="font-semibold">{label}</p>
              <p className="text-sm break-all text-ink-500">{detail}</p>
            </div>
            <Badge tone={ok === null ? 'neutral' : ok ? 'success' : 'danger'}>
              {ok === null ? 'Checking' : ok ? 'OK' : 'Problem'}
            </Badge>
          </div>
        ))}
      </Card>
    </main>
  );
}
