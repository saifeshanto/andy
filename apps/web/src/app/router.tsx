import { BadgeCheck, ClipboardCheck, LayoutDashboard, Tags, Mail, Receipt, ScrollText, Settings, Shield, Store, User, Users } from 'lucide-react';
import { createBrowserRouter } from 'react-router';
import { AccountOverviewPage } from '@/features/account/AccountOverviewPage';
import { OrdersPage } from '@/features/account/OrdersPage';
import { MembershipsPage } from '@/features/admin/memberships/MembershipsPage';
import { MerchantAdminDetailPage } from '@/features/admin/merchants/MerchantAdminDetailPage';
import { MerchantsAdminPage } from '@/features/admin/merchants/MerchantsAdminPage';
import { MerchantApplyPage } from '@/features/merchants/MerchantApplyPage';
import { AcceptInvitePage } from '@/features/merchant-portal/AcceptInvitePage';
import { MerchantHome } from '@/features/merchant-portal/MerchantHome';
import { OutletsPage } from '@/features/merchant-portal/OutletsPage';
import { MerchantPortalLayout } from '@/features/merchant-portal/PortalContext';
import { PortalOverviewPage } from '@/features/merchant-portal/PortalOverviewPage';
import { PortalProfilePage } from '@/features/merchant-portal/ProfilePage';
import { StaffPage } from '@/features/merchant-portal/StaffPage';
import { ListingEditorPage } from '@/features/merchant-portal/ListingEditorPage';
import { ListingsPage } from '@/features/merchant-portal/ListingsPage';
import { CategoriesPage } from '@/features/admin/listings/CategoriesPage';
import { ListingApprovalsPage } from '@/features/admin/listings/ListingApprovalsPage';
import { ListingReviewPage } from '@/features/admin/listings/ListingReviewPage';
import { ListingPage } from '@/features/marketplace/ListingPage';
import { MarketplacePage } from '@/features/marketplace/MarketplacePage';
import { MerchantPage } from '@/features/marketplace/MerchantPage';
import { MerchantsPage } from '@/features/marketplace/MerchantsPage';
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
  { to: '/merchant/apply', label: 'For businesses', icon: Store },
];

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users, perm: 'users.read' },
  { to: '/admin/memberships', label: 'Memberships', icon: BadgeCheck, perm: 'memberships.read' },
  { to: '/admin/orders', label: 'Orders', icon: Receipt, perm: 'orders.read' },
  { to: '/admin/merchants', label: 'Merchants', icon: Store, perm: 'merchants.read' },
  { to: '/admin/listings', label: 'Listing approvals', icon: ClipboardCheck, perm: 'listings.review' },
  { to: '/admin/categories', label: 'Categories', icon: Tags, perm: 'catalog.manage' },
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
      { path: '/marketplace', element: <MarketplacePage /> },
      { path: '/products/:slug', element: <ListingPage /> },
      { path: '/merchants', element: <MerchantsPage /> },
      { path: '/merchants/:slug', element: <MerchantPage /> },
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
      {
        element: <PublicLayout />,
        children: [
          { path: '/checkout/result', element: <CheckoutResultPage /> },
          { path: '/merchant/apply', element: <MerchantApplyPage /> },
          { path: '/merchant/invite', element: <AcceptInvitePage /> },
          { path: '/merchant', element: <MerchantHome /> },
        ],
      },
      {
        path: '/merchant/:merchantId',
        element: <MerchantPortalLayout />,
        children: [
          { index: true, element: <PortalOverviewPage /> },
          { path: 'listings', element: <ListingsPage /> },
          { path: 'listings/new', element: <ListingEditorPage /> },
          { path: 'listings/:listingId', element: <ListingEditorPage /> },
          { path: 'outlets', element: <OutletsPage /> },
          { path: 'staff', element: <StaffPage /> },
          { path: 'profile', element: <PortalProfilePage /> },
        ],
      },
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
              {
                element: <RequirePermission perms={['merchants.read']} />,
                children: [
                  { path: 'merchants', element: <MerchantsAdminPage /> },
                  { path: 'merchants/:id', element: <MerchantAdminDetailPage /> },
                  { path: 'listings/:id', element: <ListingReviewPage /> },
                ],
              },
              { element: <RequirePermission perms={['listings.review']} />, children: [{ path: 'listings', element: <ListingApprovalsPage /> }] },
              { element: <RequirePermission perms={['catalog.manage']} />, children: [{ path: 'categories', element: <CategoriesPage /> }] },
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
