import { createBrowserRouter } from 'react-router';
import { HomePage } from '@/features/home/HomePage';
import { StatusPage } from '@/features/system/StatusPage';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/status', element: <StatusPage /> },
]);
