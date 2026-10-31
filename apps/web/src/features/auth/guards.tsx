import type { PermissionKey } from '@andy/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from './AuthProvider';

/** UX only: the API is the real permission check. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status === 'signed-out') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

export function RequirePermission({ perms }: { perms: PermissionKey[] }) {
  const { can } = useAuth();
  if (!can(...perms)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">No access</h1>
        <p className="mt-2 text-ink-500">Your account does not have permission to view this page.</p>
      </div>
    );
  }
  return <Outlet />;
}

/** Sends signed-in users away from login/register pages. */
export function RedirectIfSignedIn() {
  const { status } = useAuth();
  const params = new URLSearchParams(useLocation().search);
  if (status === 'loading') return <Spinner />;
  if (status === 'signed-in') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}
