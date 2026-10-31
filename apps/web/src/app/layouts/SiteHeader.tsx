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
        <nav className="flex items-center gap-2 text-sm font-semibold">
          {status === 'signed-in' && user ? (
            <>
              {can('admin.access') && (
                <Link to="/admin" className="rounded-full px-3 py-2 hover:bg-white/10">
                  Admin
                </Link>
              )}
              <Link to="/account" className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20">
                My account
              </Link>
            </>
          ) : status === 'signed-out' ? (
            <>
              <Link to="/login" className="rounded-full px-3 py-2 hover:bg-white/10">
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
