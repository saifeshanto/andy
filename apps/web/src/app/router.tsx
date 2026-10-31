import { BadgeCheck, LayoutDashboard, Mail, Receipt, ScrollText, Settings, Shield, User, Users } from 'lucide-react';
import { createBrowserRouter } from 'react-router';
import { AccountOverviewPage } from '@/features/account/AccountOverviewPage';
import { OrdersPage } from '@/features/account/OrdersPage';
import { MembershipsPage } from '@/features/admin/memberships/MembershipsPage';
import { OrdersAdminPage } from '@/features/admin/orders/OrdersAdminPage';
import { CheckoutResultPage } from '@/features/membership/CheckoutResultPage';
import { MembershipPage } from '@/features/membership/MembershipPage';
import { ProfilePage } from '@/features/account/ProfilePage';
import { AuditLogPage } from '@/features/admin/audit/AuditLogPage';
import { AdminDashboardPage } from '@/features/admin/dashboard/AdminDashboardPage';
import { EmailLogPage } from '@/features/admin/emails/EmailLogPage';
import { RolesPage } from '@/features/admin/roles/RolesPage';
import { SettingsPage } from '@/features/admin/settings/SettingsPage';
import { UserDetailPage } from '@/features/admin/users/UserDetailPage';
import { UsersPage } from '@/features/admin/users/UsersPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { RedirectIfSignedIn, RequireAuth, RequirePermission } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { HomePage } from '@/features/home/HomePage';
import { StatusPage } from '@/features/system/StatusPage';
import { DashboardLayout, type NavItem } from './layouts/DashboardLayout';
import { PublicLayout } from './layouts/PublicLayout';

const accountNav: NavItem[] = [
  { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/account/membership', label: 'Membership', icon: BadgeCheck },
  { to: '/account/orders', label: 'Orders', icon: Receipt },
  { to: '/account/profile', label: 'Profile', icon: User },
];

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users, perm: 'users.read' },
  { to: '/admin/memberships', label: 'Memberships', icon: BadgeCheck, perm: 'memberships.read' },
  { to: '/admin/orders', label: 'Orders', icon: Receipt, perm: 'orders.read' },
  { to: '/admin/roles', label: 'Roles', icon: Shield, perm: 'roles.read' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, perm: 'settings.read' },
  { to: '/admin/audit-log', label: 'Audit log', icon: ScrollText, perm: 'audit.read' },
  { to: '/admin/emails', label: 'Email log', icon: Mail, perm: 'emails.read' },
];

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/status', element: <StatusPage /> },
    ],
  },
  {
    element: <RedirectIfSignedIn />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  {
    element: <RequireAuth />,
    children: [
      { element: <PublicLayout />, children: [{ path: '/checkout/result', element: <CheckoutResultPage /> }] },
      {
        path: '/account',
        element: <DashboardLayout title="Account" nav={accountNav} />,
        children: [
          { index: true, element: <AccountOverviewPage /> },
          { path: 'membership', element: <MembershipPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
      {
        element: <RequirePermission perms={['admin.access']} />,
        children: [
          {
            path: '/admin',
            element: <DashboardLayout title="Admin" nav={adminNav} />,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              { element: <RequirePermission perms={['users.read']} />, children: [
                { path: 'users', element: <UsersPage /> },
                { path: 'users/:id', element: <UserDetailPage /> },
              ] },
              { element: <RequirePermission perms={['memberships.read']} />, children: [{ path: 'memberships', element: <MembershipsPage /> }] },
              { element: <RequirePermission perms={['orders.read']} />, children: [{ path: 'orders', element: <OrdersAdminPage /> }] },
              { element: <RequirePermission perms={['roles.read']} />, children: [{ path: 'roles', element: <RolesPage /> }] },
              { element: <RequirePermission perms={['settings.read']} />, children: [{ path: 'settings', element: <SettingsPage /> }] },
              { element: <RequirePermission perms={['audit.read']} />, children: [{ path: 'audit-log', element: <AuditLogPage /> }] },
              { element: <RequirePermission perms={['emails.read']} />, children: [{ path: 'emails', element: <EmailLogPage /> }] },
            ],
          },
        ],
      },
    ],
  },
]);
