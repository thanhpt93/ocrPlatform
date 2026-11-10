import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  catalogApi,
  packagesApi,
  ordersApi,
  subscriptionsApi,
  licensesApi,
  usageApi,
  authApi,
} from '@/services/api/endpoints';

// Marketplace & Catalog Queries
export function useServices() {
  return useQuery({
    queryKey: ['ocr-services'],
    queryFn: catalogApi.getServices,
  });
}

export function useService(id: string) {
  return useQuery({
    queryKey: ['ocr-services', id],
    queryFn: () => catalogApi.getServiceById(id),
    enabled: !!id,
  });
}

export function useServicePackages(serviceId: string) {
  return useQuery({
    queryKey: ['ocr-services', serviceId, 'packages'],
    queryFn: () => catalogApi.getServicePackages(serviceId),
    enabled: !!serviceId,
  });
}

export function useDocumentTypes() {
  return useQuery({
    queryKey: ['document-types'],
    queryFn: catalogApi.getDocumentTypes,
  });
}

// Subscriptions Queries
export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: subscriptionsApi.getUserSubscriptions,
  });
}

// Licenses Queries
export function useLicenses() {
  return useQuery({
    queryKey: ['licenses'],
    queryFn: licensesApi.getUserLicenses,
  });
}

export function useLicense(id: string) {
  return useQuery({
    queryKey: ['licenses', id],
    queryFn: () => licensesApi.getLicenseById(id),
    enabled: !!id,
  });
}

export function useLicenseCredentials(licenseId: string) {
  return useQuery({
    queryKey: ['licenses', licenseId, 'credentials'],
    queryFn: () => licensesApi.getCredentials(licenseId),
    enabled: !!licenseId,
  });
}

// Orders Queries
export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: ordersApi.getUserOrders,
  });
}

export function usePaymentHistory() {
  return useQuery({
    queryKey: ['payments-history'],
    queryFn: ordersApi.getPaymentHistory,
  });
}

// Usage Queries
export function useUsageSummary() {
  return useQuery({
    queryKey: ['usage-summary'],
    queryFn: usageApi.getSummary,
  });
}

export function useUsageHistory() {
  return useQuery({
    queryKey: ['usage-history'],
    queryFn: usageApi.getHistory,
  });
}

// Admin Queries
export function useAdminServices() {
  return useQuery({
    queryKey: ['admin-ocr-services'],
    queryFn: catalogApi.adminGetServices,
  });
}

export function useAdminDocumentTypes() {
  return useQuery({
    queryKey: ['admin-document-types'],
    queryFn: catalogApi.adminGetDocumentTypes,
  });
}

export function useAdminPackages() {
  return useQuery({
    queryKey: ['admin-packages'],
    queryFn: packagesApi.adminGetPackages,
  });
}

export function useAdminLicenses() {
  return useQuery({
    queryKey: ['admin-licenses'],
    queryFn: licensesApi.adminGetLicenses,
  });
}

export function useAdminCustomers() {
  return useQuery({
    queryKey: ['admin-customers'],
    queryFn: licensesApi.adminGetCustomers,
  });
}
