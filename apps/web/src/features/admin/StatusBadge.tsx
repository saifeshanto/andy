import { Badge } from '@/components/ui/Badge';
import type { AdminUser } from './types';

const map = {
  ACTIVE: ['success', 'Active'],
  PENDING_VERIFICATION: ['warning', 'Unverified'],
  SUSPENDED: ['danger', 'Suspended'],
} as const;

export function UserStatusBadge({ status }: { status: AdminUser['status'] }) {
  const [tone, label] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}
