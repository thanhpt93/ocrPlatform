import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

// Layouts
import { CustomerLayout } from '@/app/layouts/CustomerLayout';
import { AdminLayout } from '@/app/layouts/AdminLayout';

// Auth Modules
import { LoginPage } from '@/modules/auth/LoginPage';
import { RegisterPage } from '@/modules/auth/RegisterPage';

// Customer Portal Modules
import { CustomerDashboard } from '@/modules/customer/dashboard/CustomerDashboard';
import { MarketplacePage } from '@/modules/customer/marketplace/MarketplacePage';
import { ServiceDetailPage } from '@/modules/customer/marketplace/ServiceDetailPage';
import { SubscriptionsPage } from '@/modules/customer/subscriptions/SubscriptionsPage';
import { LicensesPage } from '@/modules/customer/licenses/LicensesPage';
import { UsageAnalyticsPage } from '@/modules/customer/usage/UsageAnalyticsPage';
import { JobsPage } from '@/modules/customer/jobs/JobsPage';
import { BillingPage } from '@/modules/customer/billing/BillingPage';
import { SettingsPage } from '@/modules/customer/settings/SettingsPage';

// Admin Portal Modules
import { AdminDashboard } from '@/modules/admin/dashboard/AdminDashboard';
import { ServiceManagementPage } from '@/modules/admin/services/ServiceManagementPage';
import { DocumentTypeManagementPage } from '@/modules/admin/document-types/DocumentTypeManagementPage';
import { PackageManagementPage } from '@/modules/admin/packages/PackageManagementPage';
import { CustomerManagementPage } from '@/modules/admin/customers/CustomerManagementPage';
import { CustomerDetailPage } from '@/modules/admin/customers/CustomerDetailPage';
import { LicenseManagementPage } from '@/modules/admin/licenses/LicenseManagementPage';
import { AdminBillingPage } from '@/modules/admin/billing/AdminBillingPage';
import { MonitoringPage } from '@/modules/admin/monitoring/MonitoringPage';
import { SystemManagementPage } from '@/modules/admin/system/SystemManagementPage';

const RootRedirect: React.FC = () => {
  const token = localStorage.getItem('ocr_access_token');
  return <Navigate to={token ? '/app/dashboard' : '/login'} replace />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  // Customer Portal Routes
  {
    path: '/app',
    element: <CustomerLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/app/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <CustomerDashboard />,
      },
      {
        path: 'marketplace',
        element: <MarketplacePage />,
      },
      {
        path: 'marketplace/:id',
        element: <ServiceDetailPage />,
      },
      {
        path: 'subscriptions',
        element: <SubscriptionsPage />,
      },
      {
        path: 'licenses',
        element: <LicensesPage />,
      },
      {
        path: 'usage',
        element: <UsageAnalyticsPage />,
      },
      {
        path: 'jobs',
        element: <JobsPage />,
      },
      {
        path: 'billing',
        element: <BillingPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
  // Platform Admin Portal Routes
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/admin/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <AdminDashboard />,
      },
      {
        path: 'services',
        element: <ServiceManagementPage />,
      },
      {
        path: 'document-types',
        element: <DocumentTypeManagementPage />,
      },
      {
        path: 'packages',
        element: <PackageManagementPage />,
      },
      {
        path: 'customers',
        element: <CustomerManagementPage />,
      },
      {
        path: 'customers/:id',
        element: <CustomerDetailPage />,
      },
      {
        path: 'licenses',
        element: <LicenseManagementPage />,
      },
      {
        path: 'billing',
        element: <AdminBillingPage />,
      },
      {
        path: 'monitoring',
        element: <MonitoringPage />,
      },
      {
        path: 'system',
        element: <SystemManagementPage />,
      },
    ],
  },
  // Fallback
  {
    path: '*',
    element: <Navigate to="/app/dashboard" replace />,
  },
]);
