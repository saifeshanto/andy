import { Outlet } from 'react-router';
import { SiteHeader } from './SiteHeader';

export function PublicLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
    </>
  );
}
