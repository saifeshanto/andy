import { Link } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';

export function SiteHeader() {
  const { status, user, can } = useAuth();
  return (
    <header className="bg-ink-950 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/" className="font-display text-xl font-bold uppercase tracking-wide">
          Andy <span className="text-accent-400">Auto Club</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold sm:gap-2">
          <Link to="/marketplace" className="rounded-full px-3 py-2 hover:bg-white/10">
            Marketplace
          </Link>
          <Link to="/merchants" className="hidden rounded-full px-3 py-2 hover:bg-white/10 sm:inline-flex">
            Merchants
          </Link>
          {status === 'signed-in' && user ? (
            <>
              {can('admin.access') && (
                <Link to="/admin" className="hidden rounded-full px-3 py-2 hover:bg-white/10 sm:inline-flex">
                  Admin
                </Link>
              )}
              <Link to="/account" className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20">
                Account
              </Link>
            </>
          ) : status === 'signed-out' ? (
            <>
              <Link to="/login" className="hidden rounded-full px-3 py-2 hover:bg-white/10 sm:inline-flex">
                Sign in
              </Link>
              <Link to="/register" className="rounded-full bg-accent-500 px-4 py-2 hover:bg-accent-600">
                Join
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
