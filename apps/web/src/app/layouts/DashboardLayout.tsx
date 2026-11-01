import type { PermissionKey } from '@andy/shared';
import type { LucideIcon } from 'lucide-react';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: PermissionKey;
  end?: boolean;
}

/** Sidebar on desktop, slide-down menu on mobile. Shared by the account and admin areas. */
export function DashboardLayout({ title, nav }: { title: string; nav: NavItem[] }) {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = nav.filter((i) => !i.perm || can(i.perm));

  const links = (
    <nav className="space-y-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white'}`
          }
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="bg-ink-950 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="flex items-center justify-between px-4 py-4 lg:px-5 lg:py-6">
          <Link to="/" className="font-display text-xl font-bold uppercase tracking-wide">
            Andy <span className="text-accent-400">{title}</span>
          </Link>
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        <div className={`${open ? 'block' : 'hidden'} px-3 pb-4 lg:block lg:flex-1 lg:overflow-y-auto`}>{links}</div>
        <div className={`${open ? 'block' : 'hidden'} border-t border-white/10 px-4 py-4 lg:block`}>
          <p className="truncate text-sm font-semibold">{user?.fullName}</p>
          <p className="truncate text-xs text-ink-300">{user?.email}</p>
          <button
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="mt-3 flex items-center gap-2 text-sm text-ink-300 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-ink-50 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-ink-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
