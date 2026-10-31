import { useQuery } from '@tanstack/react-query';

export interface Health {
  status: 'ok' | 'degraded';
  time: string;
  node: string;
  uptimeSeconds: number;
  database: { ok: boolean; version?: string; error?: string };
  cron: { lastHeartbeatAt: string | null };
}

export function useHealth() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: async (): Promise<Health> => {
      const res = await fetch('/api/v1/system/health');
      const body = await res.json();
      return body.data as Health;
    },
    refetchInterval: 30_000,
  });
}
