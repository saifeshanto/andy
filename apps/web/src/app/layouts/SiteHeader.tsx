import { Link } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';

export function SiteHeader() {
  const { status, user, can } = useAuth();
  return (
    <header className="bg-ink-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:py-4 sm:px-6">
        <Link to="/" className="whitespace-nowrap font-display text-xl font-bold uppercase tracking-wide">
          Andy <span className="text-accent-400">Auto Club</span>
        </Link>
        {/* Browse links: their own scrollable row on phones, inline on wider screens. */}
        <nav aria-label="Browse" className="order-last -mx-2 flex w-full gap-1 overflow-x-auto text-sm font-semibold sm:order-none sm:mx-0 sm:ml-auto sm:w-auto sm:gap-2">
          <Link to="/marketplace" className="shrink-0 rounded-full px-3 py-2 hover:bg-white/10">
            Marketplace
          </Link>
          <Link to="/vouchers" className="shrink-0 rounded-full px-3 py-2 hover:bg-white/10">
            Vouchers
          </Link>
          <Link to="/merchants" className="shrink-0 rounded-full px-3 py-2 hover:bg-white/10">
            Merchants
          </Link>
        </nav>
        <nav aria-label="Account" className="flex items-center gap-1 text-sm font-semibold sm:gap-2">
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
