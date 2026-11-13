import { api } from './client';
import {
  AdminDashboardStats,
  AdminMonitoring,
  AdminSystemConfig,
  AdminUsageRecord,
} from '@/types';

// Auth API
export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post<{ access_token: string; refresh_token: string; user_id: string; email: string; full_name: string; role: string }>('/auth/login', data),
  register: (data: { email: string; password: string; full_name: string; company_name?: string; phone?: string }) =>
    api.post<{ access_token: string; refresh_token: string; user_id: string; email: string; full_name: string; role: string }>('/auth/register', data),
  getMe: () => api.get<any>('/users/me'),
  logout: () => api.post('/auth/logout', {}),
};

// Catalog API
export const catalogApi = {
  getServices: () => api.get<any[]>('/ocr-services'),
  getServiceById: (id: string) => api.get<any>(`/ocr-services/${id}`),
  getServicePackages: (serviceId: string) => api.get<any[]>(`/ocr-services/${serviceId}/packages`),
  getDocumentTypes: () => api.get<any[]>('/document-types'),

  // Admin Catalog
  adminGetServices: () => api.get<any[]>('/admin/ocr-services'),
  adminCreateService: (data: any) => api.post<any>('/admin/ocr-services', data),
  adminUpdateService: (id: string, data: any) => api.put<any>(`/admin/ocr-services/${id}`, data),
  adminPublishService: (id: string, publish: boolean) => api.post<any>(`/admin/ocr-services/${id}/publish`, { publish }),
  adminDeleteService: (id: string) => api.delete<any>(`/admin/ocr-services/${id}`),

  // Admin Document Types
  adminGetDocumentTypes: () => api.get<any[]>('/admin/document-types'),
  adminCreateDocumentType: (data: any) => api.post<any>('/admin/document-types', data),
  adminUpdateDocumentType: (id: string, data: any) => api.put<any>(`/admin/document-types/${id}`, data),
  adminDeleteDocumentType: (id: string) => api.delete<any>(`/admin/document-types/${id}`),
};

// Packages API
export const packagesApi = {
  getPackages: () => api.get<any[]>('/packages'),
  getPackageById: (id: string) => api.get<any>(`/packages/${id}`),
  getCreditRates: () => api.get<any[]>('/credit-rates'),

  // Admin Packages
  adminGetPackages: () => api.get<any[]>('/admin/packages'),
  adminCreatePackage: (data: any) => api.post<any>('/admin/packages', data),
  adminUpdatePackage: (id: string, data: any) => api.put<any>(`/admin/packages/${id}`, data),
  adminCreateVersion: (packageId: string, data: any) => api.post<any>(`/admin/packages/${packageId}/versions`, data),
  adminToggleActive: (packageId: string, active: boolean) => api.post<any>(`/admin/packages/${packageId}/activate`, { active }),
  adminDeletePackage: (id: string) => api.delete<any>(`/admin/packages/${id}`),
};

// Orders & Checkout API
export const ordersApi = {
  createOrder: (packageVersionId: string, idempotencyKey?: string) =>
    api.post<any>('/orders', { package_version_id: packageVersionId, idempotency_key: idempotencyKey }),
  checkout: (orderId: string, data: { payment_method: string; simulate_failure?: boolean; idempotency_key?: string }) =>
    api.post<any>(`/orders/${orderId}/checkout`, data),
  getUserOrders: () => api.get<any[]>('/orders'),
  getOrderById: (orderId: string) => api.get<any>(`/orders/${orderId}`),
  getPaymentHistory: () => api.get<any[]>('/payments/history'),
};

// Subscriptions API
export const subscriptionsApi = {
  getUserSubscriptions: () => api.get<any[]>('/subscriptions'),
  getSubscriptionById: (id: string) => api.get<any>(`/subscriptions/${id}`),
};

// Licenses & Credentials API
export const licensesApi = {
  getUserLicenses: () => api.get<any[]>('/licenses'),
  getLicenseById: (id: string) => api.get<any>(`/licenses/${id}`),
  activateLicense: (licenseKey: string) => api.post<any>('/licenses/activate', { license_key: licenseKey }),
  getCredentials: (licenseId: string) => api.get<any[]>(`/licenses/${licenseId}/credentials`),
  createCredential: (licenseId: string, name: string) => api.post<any>(`/licenses/${licenseId}/credentials`, { name }),
  revokeCredential: (licenseId: string, credentialId: string) =>
    api.delete(`/licenses/${licenseId}/credentials/${credentialId}`),

  // Admin Licenses
  adminGetLicenses: () => api.get<any[]>('/admin/licenses/overview'),
  adminGenerateLicense: (data: { user_id: string; package_version_id: string; notes?: string }) =>
    api.post<any>('/admin/licenses/generate', data),
  adminUpdateLicenseStatus: (id: string, status: string, notes?: string) =>
    api.patch<any>(`/admin/licenses/${id}/status`, { status, notes }),
  adminGetCustomers: () => api.get<any[]>('/admin/customers/overview'),
};

// Admin Platform API
export const adminApi = {
  getDashboard: () => api.get<AdminDashboardStats>('/admin/dashboard'),
  getCustomersOverview: () => api.get<any[]>('/admin/customers/overview'),
  getCustomerDetail: (customerId: string) => api.get<any>(`/admin/customers/${customerId}`),
  updateCustomerStatus: (customerId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING') =>
    api.patch<any>(`/admin/customers/${customerId}/status`, { status }),
  getSubscriptions: () => api.get<any[]>('/admin/subscriptions'),
  getOrders: () => api.get<any[]>('/admin/orders'),
  getPayments: () => api.get<any[]>('/admin/payments'),
  getLicensesOverview: () => api.get<any[]>('/admin/licenses/overview'),
  updateLicenseStatus: (licenseId: string, status: string, notes?: string) =>
    api.patch<any>(`/admin/licenses/${licenseId}/status`, { status, notes }),
  getUsageRecords: (limit = 100) => api.get<AdminUsageRecord[]>(`/admin/usage-records?limit=${limit}`),
  getMonitoring: () => api.get<AdminMonitoring>('/admin/monitoring'),
  getOperators: () => api.get<any[]>('/admin/operators'),
  createOperator: (data: { email: string; full_name: string; password: string }) =>
    api.post<any>('/admin/operators', data),
  getAuditLogs: (limit = 100) => api.get<any[]>(`/admin/audit-logs?limit=${limit}`),
  getSystemConfig: () => api.get<AdminSystemConfig>('/admin/system/config'),
};

// Usage API
export const usageApi = {
  getSummary: () => api.get<any>('/usage/summary'),
  getHistory: () => api.get<any>('/usage/history'),
};

// OCR Engine VLM API
export const ocrApi = {
  processIdentity: (formData: FormData) =>
    api.post<any>('/ocr/process-identity', formData),
  getHealth: () =>
    api.get<any>('/ocr/health'),
};
