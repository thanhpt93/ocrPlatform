import { create } from 'zustand';
import {
  OCRService,
  DocumentType,
  Package,
  Customer,
  Subscription,
  License,
  OCRJob,
  Order,
  Invoice,
  Payment,
  AdminUser,
  AuditLog,
  DailyUsageStat,
  LicenseStatus,
  ServiceStatus,
  CustomerStatus,
  AdminDashboardStats,
  AdminMonitoring,
  AdminSystemConfig,
  AdminUsageRecord,
} from '@/types';
import {
  catalogApi,
  packagesApi,
  ordersApi,
  subscriptionsApi,
  licensesApi,
  authApi,
  adminApi,
} from '@/services/api/endpoints';
import { api } from '@/services/api/client';

interface PlatformState {
  // Data
  services: OCRService[];
  docTypes: DocumentType[];
  packages: Package[];
  customers: Customer[];
  subscriptions: Subscription[];
  licenses: License[];
  jobs: OCRJob[];
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  adminUsers: AdminUser[];
  auditLogs: AuditLog[];
  dailyStats: DailyUsageStat[];

  // Real Admin Telemetry & Aggregates
  adminDashboard: AdminDashboardStats | null;
  adminMonitoring: AdminMonitoring | null;
  adminSystemConfig: AdminSystemConfig | null;
  adminUsageRecords: AdminUsageRecord[];
  adminLoading: boolean;
  adminError: string | null;

  // Session & Context
  activePortal: 'customer' | 'admin';
  activeCustomerId: string;
  searchQuery: string;
  backendConnected: boolean;
  currentUser: any | null;

  // Actions - Portals & Context
  setActivePortal: (portal: 'customer' | 'admin') => void;
  setActiveCustomerId: (customerId: string) => void;
  setSearchQuery: (query: string) => void;
  syncWithBackend: () => Promise<void>;
  syncAdminData: () => Promise<void>;
  loginUser: (email: string, password: string) => Promise<boolean>;

  // Actions - OCR Services
  addService: (service: Omit<OCRService, 'id' | 'rating' | 'reviewCount'>) => Promise<void>;
  updateService: (id: string, service: Partial<OCRService>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  setServiceStatus: (id: string, status: ServiceStatus) => Promise<void>;

  // Actions - Document Types
  addDocType: (docType: Omit<DocumentType, 'id'>) => Promise<void>;
  updateDocType: (id: string, docType: Partial<DocumentType>) => Promise<void>;
  deleteDocType: (id: string) => Promise<void>;

  // Actions - Packages
  addPackage: (pkg: Omit<Package, 'id'>) => Promise<void>;
  updatePackage: (id: string, pkg: Partial<Package>) => Promise<void>;
  deletePackage: (id: string) => Promise<void>;

  // Actions - Customers
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  toggleCustomerStatus: (id: string) => Promise<void>;

  // Actions - Licenses
  generateSingleLicense: (params: {
    customerId: string;
    serviceId?: string;
    packageId: string;
    notes?: string;
  }) => Promise<{ license: License; rawKey: string }>;
  generateBulkLicenses: (params: {
    customerId: string;
    serviceId?: string;
    packageId: string;
    count: number;
    notes?: string;
  }) => Promise<Array<{ license: License; rawKey: string }>>;
  activateLicenseByKey: (key: string) => { success: boolean; message: string; license?: License };
  setLicenseStatus: (id: string, status: LicenseStatus, note?: string) => Promise<void>;
  renewLicense: (id: string, additionalMonths: number) => void;

  // Actions - Operators
  createAdminOperator: (data: { email: string; full_name: string; password: string }) => Promise<void>;

  // Actions - Subscriptions & Orders
  checkoutPackage: (params: {
    packageId: string;
    paymentMethod: string;
  }) => Promise<{ success: boolean; orderId: string; subscriptionId: string; licenseId: string; licenseKey?: string; maskedKey?: string }>;
  renewSubscription: (id: string) => void;
  cancelSubscription: (id: string) => void;

  // Actions - OCR Jobs (Customer local workspace history for uploaded files)
  retryJob: (jobId: string) => void;
  submitNewJob: (job: Omit<OCRJob, 'id' | 'submissionTime' | 'status'> & Partial<Pick<OCRJob, 'id' | 'submissionTime' | 'status'>>) => void;
}

const LEGACY_STORAGE_KEY = 'ocr_platform_state_v1';
const JOBS_STORAGE_KEY = 'ocr_customer_jobs_v2';

// Remove legacy mock localStorage cache if it exists from older builds
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore storage access issues
  }
}

const loadStoredJobs = (userId?: string): OCRJob[] => {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = localStorage.getItem(JOBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((j: any) => j && j.customerId === userId)
      .map((j: any) => (j.status === 'processing' && j.extractedDataPreview ? { ...j, status: 'completed' } : j));
  } catch {
    return [];
  }
};

const saveStoredJobs = (jobs: OCRJob[]) => {
  if (typeof window === 'undefined') return;
  const build = (maxImgs: number) =>
    jobs.slice(0, 30).map((j, idx) => (idx < maxImgs ? j : { ...j, originalImageUrl: undefined, croppedImageUrl: undefined }));
  try {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(build(5)));
  } catch {
    try {
      localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(build(0)));
    } catch {
      // ignore quota exceeded
    }
  }
};

const mapService = (s: any): OCRService => ({
  id: s.id,
  code: s.code,
  name: s.name,
  category: s.category,
  description: s.description,
  longDescription: s.long_description,
  thumbnail: s.thumbnail || 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80',
  supportedFileFormats: s.supported_file_formats || [],
  supportedLanguages: s.supported_languages || [],
  capabilities: s.capabilities || [],
  supportedDocTypeIds: s.supported_doc_type_ids || [],
  processingMode: s.processing_mode,
  displayOrder: s.display_order,
  status: s.status,
  startingPrice: s.starting_price,
  rating: s.rating,
  reviewCount: s.review_count,
  sla: s.sla,
});

const mapDocType = (d: any): DocumentType => ({
  id: d.id,
  code: d.code,
  name: d.name,
  description: d.description || '',
  category: d.category,
  exampleImage: d.example_image,
  supportedServiceIds: d.supported_service_ids || [],
  status: d.status,
});

const mapPackage = (p: any): Package => {
  const cur = p.current_version;
  return {
    id: p.id,
    currentVersionId: cur ? cur.id : undefined,
    versionNumber: cur ? cur.version_number : 1,
    code: p.code,
    name: p.name,
    tier: p.tier,
    serviceId: p.service_id,
    serviceName: p.service_name || '',
    price: cur ? cur.price : 0,
    currency: cur ? cur.currency : 'USD',
    quotaType: cur ? cur.quota_type : 'Page',
    quotaAmount: cur ? cur.quota_amount : 1000,
    duration: cur ? cur.duration : 'monthly',
    billingType: cur ? cur.billing_type : 'one_time',
    apiAccess: cur ? cur.api_access : true,
    batchProcessing: cur ? cur.batch_processing : false,
    priorityProcessing: cur ? cur.priority_processing : false,
    autoRenewal: cur ? cur.auto_renewal : false,
    overagePolicy: cur ? cur.overage_policy : 'block',
    status: p.status,
    features: cur ? cur.features : [],
  };
};

const toBackendBillingType = (bt?: string): 'one_time' | 'recurring' => {
  if (bt === 'recurring' || bt === 'postpaid') return 'recurring';
  return 'one_time';
};

const mapAdminCustomer = (c: any): Customer => ({
  id: c.id,
  orgName: c.profile?.company_name || c.full_name || c.email,
  fullName: c.full_name,
  email: c.email,
  phone: c.profile?.phone || '',
  address: c.profile?.address || '',
  taxId: c.profile?.tax_id || '',
  registrationDate: c.created_at ? c.created_at.split('T')[0] : '',
  tier: c.tier || 'Standard',
  status: (c.status || 'ACTIVE').toLowerCase() as CustomerStatus,
  memberCount: 1,
  members: [
    {
      id: c.id,
      name: c.full_name || c.email,
      email: c.email,
      role: 'Owner',
      status: (c.status || 'ACTIVE').toLowerCase() === 'active' ? 'active' : 'invited',
      addedDate: c.created_at ? c.created_at.split('T')[0] : '',
    },
  ],
  activeSubscriptionsCount: c.active_subscriptions_count || 0,
  activeLicensesCount: c.active_licenses_count || 0,
  totalUsagePages: c.total_usage || 0,
  totalSpend: c.total_spend || 0,
  monthlySpend: c.monthly_spend || 0,
});

const mapAdminLicense = (l: any): License => ({
  id: l.id,
  licenseKey: l.masked_key,
  maskedKey: l.masked_key,
  customerId: l.user_id,
  customerName: l.customer_name || l.customer_email || l.user_id,
  customerEmail: l.customer_email || '',
  serviceId: l.service_id,
  serviceName: l.service_name || '',
  packageId: l.package_id || '',
  packageName: l.package_name || '',
  subscriptionId: l.subscription_id || undefined,
  quota: l.quota || 0,
  usedQuota: l.used_quota || 0,
  remainingQuota: l.remaining_quota ?? Math.max(0, (l.quota || 0) - (l.used_quota || 0)),
  startDate: l.issued_at ? l.issued_at.split('T')[0] : '',
  expirationDate: l.expires_at ? l.expires_at.split('T')[0] : '',
  status: l.status,
  history: (l.events || []).map((ev: any) => ({
    id: ev.id,
    action: ev.action,
    timestamp: ev.created_at ? new Date(ev.created_at).toLocaleString() : '',
    actor: ev.actor_id,
    notes: ev.notes || '',
  })),
});

const initialUser = api.getCurrentUser();

export const usePlatformStore = create<PlatformState>((set, get) => ({
  services: [],
  docTypes: [],
  packages: [],
  customers: [],
  subscriptions: [],
  licenses: [],
  jobs: loadStoredJobs(initialUser?.id),
  orders: [],
  invoices: [],
  payments: [],
  adminUsers: [],
  auditLogs: [],
  dailyStats: [],

  adminDashboard: null,
  adminMonitoring: null,
  adminSystemConfig: null,
  adminUsageRecords: [],
  adminLoading: false,
  adminError: null,

  activePortal: initialUser?.role === 'PLATFORM_ADMIN' ? 'admin' : 'customer',
  activeCustomerId: initialUser?.id || '',
  searchQuery: '',
  backendConnected: false,
  currentUser: initialUser,

  setActivePortal: (portal) => set({ activePortal: portal }),
  setActiveCustomerId: (customerId) => set({ activeCustomerId: customerId }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  loginUser: async (email, password) => {
    try {
      const res = await authApi.login({ email, password });
      api.setTokens(res.access_token, res.refresh_token, {
        id: res.user_id,
        email: res.email,
        full_name: res.full_name,
        role: res.role,
      });
      set({
        currentUser: api.getCurrentUser(),
        activeCustomerId: res.user_id,
        activePortal: res.role === 'PLATFORM_ADMIN' ? 'admin' : 'customer',
        jobs: loadStoredJobs(res.user_id),
      });
      await get().syncWithBackend();
      return true;
    } catch (e) {
      console.error('Login failed:', e);
      return false;
    }
  },

  syncAdminData: async () => {
    const curUser = api.getCurrentUser();
    if (!curUser || curUser.role !== 'PLATFORM_ADMIN') {
      return;
    }
    set({ adminLoading: true, adminError: null });
    try {
      const [
        rawServices,
        rawDocTypes,
        rawPackages,
        dashboardStats,
        rawCustomers,
        rawSubs,
        rawLicenses,
        rawOrders,
        rawPayments,
        rawUsageRecords,
        monitoring,
        rawOperators,
        rawAuditLogs,
        systemConfig,
      ] = await Promise.all([
        catalogApi.adminGetServices(),
        catalogApi.adminGetDocumentTypes(),
        packagesApi.adminGetPackages(),
        adminApi.getDashboard(),
        adminApi.getCustomersOverview(),
        adminApi.getSubscriptions(),
        adminApi.getLicensesOverview(),
        adminApi.getOrders(),
        adminApi.getPayments(),
        adminApi.getUsageRecords(100),
        adminApi.getMonitoring(),
        adminApi.getOperators(),
        adminApi.getAuditLogs(100),
        adminApi.getSystemConfig(),
      ]);

      const mappedServices = Array.isArray(rawServices) ? rawServices.map(mapService) : [];
      const mappedDocTypes = Array.isArray(rawDocTypes) ? rawDocTypes.map(mapDocType) : [];
      const mappedPackages = Array.isArray(rawPackages) ? rawPackages.map(mapPackage) : [];
      const mappedCustomers = Array.isArray(rawCustomers) ? rawCustomers.map(mapAdminCustomer) : [];

      const mappedSubs: Subscription[] = Array.isArray(rawSubs)
        ? rawSubs.map((s) => ({
            id: s.id,
            customerId: s.user_id,
            customerName: s.customer_name || s.customer_email,
            customerEmail: s.customer_email,
            serviceId: s.service_id,
            serviceName: s.service_name || '',
            packageId: s.package_id || s.package_version_id,
            packageName: s.package_name || '',
            startDate: s.start_date ? s.start_date.split('T')[0] : '',
            endDate: s.end_date ? s.end_date.split('T')[0] : '',
            autoRenew: Boolean(s.auto_renew),
            totalQuota: s.total_quota || 0,
            usedQuota: s.used_quota || 0,
            remainingQuota: s.remaining_quota || 0,
            status: s.status,
            price: s.price || 0,
            currency: s.currency || 'USD',
            billingCycle: s.billing_cycle || 'monthly',
          }))
        : [];

      const mappedLicenses = Array.isArray(rawLicenses) ? rawLicenses.map(mapAdminLicense) : [];

      const mappedOrders: Order[] = Array.isArray(rawOrders)
        ? rawOrders.map((o) => ({
            id: o.id,
            orderNumber: o.order_number,
            customerId: o.user_id,
            customerName: o.customer_name || o.customer_email,
            customerEmail: o.customer_email,
            serviceName: o.service_name || '',
            packageName: o.package_name || '',
            amount: o.amount,
            currency: o.currency || 'USD',
            date: o.created_at ? o.created_at.split('T')[0] : '',
            status: o.status,
            paymentMethod: o.payment_method || 'N/A',
          }))
        : [];

      const mappedPayments: Payment[] = Array.isArray(rawPayments)
        ? rawPayments.map((p) => ({
            id: p.id,
            paymentNumber: p.payment_number,
            orderId: p.order_id,
            orderNumber: p.order_number || p.order_id,
            customerId: p.user_id,
            customerName: p.customer_name || p.customer_email,
            customerEmail: p.customer_email,
            amount: p.amount,
            currency: p.currency || 'USD',
            method: p.method,
            date: p.created_at ? new Date(p.created_at).toLocaleString() : '',
            status: p.status,
            transactionReference: p.transaction_reference,
            failureReason: p.failure_reason,
          }))
        : [];

      const mappedOperators: AdminUser[] = Array.isArray(rawOperators)
        ? rawOperators.map((op) => ({
            id: op.id,
            name: op.full_name,
            email: op.email,
            role: op.role === 'PLATFORM_ADMIN' ? 'Platform Admin' : op.role,
            status: (op.status || 'ACTIVE').toLowerCase() as AdminUser['status'],
            createdAt: op.created_at,
            lastLogin: op.updated_at ? new Date(op.updated_at).toLocaleString() : '-',
          }))
        : [];

      const mappedAuditLogs: AuditLog[] = Array.isArray(rawAuditLogs)
        ? rawAuditLogs.map((log) => ({
            id: log.id,
            timestamp: log.created_at ? new Date(log.created_at).toLocaleString() : '',
            actor: log.actor_name || log.actor_email,
            actorEmail: log.actor_email,
            action: log.action,
            resourceType: log.resource_type,
            resourceId: log.resource_id,
            ipAddress: log.ip_address || '127.0.0.1',
            details: log.details || '',
            severity: (log.severity || 'info') as AuditLog['severity'],
          }))
        : [];

      const mappedDailyStats: DailyUsageStat[] = (dashboardStats?.daily_usage || []).map((d) => ({
        date: d.date,
        pages: d.units,
        jobs: d.jobs,
        failed: 0,
        avgDurationMs: 0,
      }));

      set({
        services: mappedServices,
        docTypes: mappedDocTypes,
        packages: mappedPackages,
        customers: mappedCustomers,
        subscriptions: mappedSubs,
        licenses: mappedLicenses,
        orders: mappedOrders,
        payments: mappedPayments,
        adminUsers: mappedOperators,
        auditLogs: mappedAuditLogs,
        dailyStats: mappedDailyStats,
        adminDashboard: dashboardStats,
        adminMonitoring: monitoring,
        adminSystemConfig: systemConfig,
        adminUsageRecords: Array.isArray(rawUsageRecords) ? rawUsageRecords : [],
        backendConnected: true,
        adminLoading: false,
        adminError: null,
      });
    } catch (e: any) {
      console.error('Admin sync failed:', e);
      set({
        adminLoading: false,
        adminError: e?.message || 'Failed to load admin data from backend',
      });
    }
  },

  syncWithBackend: async () => {
    try {
      const curUser = api.getCurrentUser();
      if (curUser && curUser.role === 'PLATFORM_ADMIN') {
        set({ currentUser: curUser, activeCustomerId: curUser.id });
        await get().syncAdminData();
        return;
      }

      const [rawServices, rawDocTypes, rawPackages] = await Promise.all([
        catalogApi.getServices(),
        catalogApi.getDocumentTypes(),
        packagesApi.getPackages(),
      ]);

      const mappedServices = Array.isArray(rawServices) ? rawServices.map(mapService) : [];
      const mappedDocTypes = Array.isArray(rawDocTypes) ? rawDocTypes.map(mapDocType) : [];
      const mappedPackages = Array.isArray(rawPackages) ? rawPackages.map(mapPackage) : [];

      let mappedSubs: Subscription[] = [];
      let mappedLics: License[] = [];
      let mappedOrders: Order[] = [];
      let mappedPayments: Payment[] = [];
      let customerList: Customer[] = [];

      if (curUser) {
        try {
          const [rawSubs, rawLics, rawOrders, rawPays] = await Promise.all([
            subscriptionsApi.getUserSubscriptions(),
            licensesApi.getUserLicenses(),
            ordersApi.getUserOrders(),
            ordersApi.getPaymentHistory(),
          ]);

          const displayName = curUser.company_name || curUser.full_name || curUser.email;

          if (Array.isArray(rawSubs)) {
            mappedSubs = rawSubs.map((s) => ({
              id: s.id,
              customerId: s.user_id,
              customerName: displayName,
              serviceId: s.service_id,
              serviceName: s.service_name || '',
              packageId: s.package_id || s.package_version_id,
              packageName: s.package_name || '',
              startDate: s.start_date.split('T')[0],
              endDate: s.end_date.split('T')[0],
              autoRenew: s.auto_renew,
              totalQuota: s.total_quota,
              usedQuota: s.used_quota,
              remainingQuota: s.remaining_quota,
              status: s.status,
              price: 0,
              billingCycle: 'monthly',
            }));
          }

          if (Array.isArray(rawLics)) {
            mappedLics = rawLics.map((l) => ({
              id: l.id,
              licenseKey: l.masked_key,
              maskedKey: l.masked_key,
              customerId: l.user_id,
              customerName: displayName,
              serviceId: l.service_id,
              serviceName: l.service_name || '',
              packageId: l.package_id || '',
              packageName: l.package_name || '',
              subscriptionId: l.subscription_id,
              quota: l.quota,
              usedQuota: l.used_quota,
              remainingQuota: l.remaining_quota,
              startDate: l.issued_at.split('T')[0],
              expirationDate: l.expires_at.split('T')[0],
              status: l.status,
              history: [],
            }));
          }

          if (Array.isArray(rawOrders)) {
            mappedOrders = rawOrders.map((o) => ({
              id: o.id,
              orderNumber: o.order_number,
              customerId: o.user_id,
              customerName: displayName,
              serviceName: o.service_name || '',
              packageName: o.package_name || '',
              amount: o.amount,
              currency: (o.currency || 'USD') as any,
              date: o.created_at.split('T')[0],
              status: o.status,
              paymentMethod: 'Card',
            }));
          }

          if (Array.isArray(rawPays)) {
            mappedPayments = rawPays.map((p) => ({
              id: p.id,
              paymentNumber: p.payment_number,
              orderId: p.order_id,
              orderNumber: p.order_number || p.order_id,
              customerId: p.user_id,
              customerName: displayName,
              amount: p.amount,
              currency: (p.currency || 'USD') as any,
              method: p.method,
              date: p.created_at ? new Date(p.created_at).toLocaleString() : '',
              status: p.status,
            }));
          }

          customerList = [
            {
              id: curUser.id,
              orgName: displayName,
              fullName: curUser.full_name,
              email: curUser.email,
              phone: curUser.phone || '',
              address: '',
              taxId: '',
              registrationDate: new Date().toISOString().split('T')[0],
              tier: 'Standard',
              status: 'active',
              memberCount: 1,
              members: [
                {
                  id: curUser.id,
                  name: curUser.full_name || curUser.email,
                  email: curUser.email,
                  role: 'Owner',
                  status: 'active',
                  addedDate: new Date().toISOString().split('T')[0],
                },
              ],
              activeSubscriptionsCount: mappedSubs.length,
              activeLicensesCount: mappedLics.length,
              totalUsagePages: mappedLics.reduce((a, b) => a + (b.usedQuota || 0), 0),
              monthlySpend: mappedOrders
                .filter((o) => o.status === 'completed')
                .reduce((a, b) => a + b.amount, 0),
            },
          ];
        } catch (err) {
          console.warn('Customer portal fetch note:', err);
        }
      }

      set({
        currentUser: curUser,
        activeCustomerId: curUser ? curUser.id : '',
        customers: customerList,
        services: mappedServices,
        docTypes: mappedDocTypes,
        packages: mappedPackages,
        subscriptions: mappedSubs,
        licenses: mappedLics,
        orders: mappedOrders,
        payments: mappedPayments,
        jobs: loadStoredJobs(curUser?.id),
        backendConnected: true,
      });
    } catch (e) {
      console.warn('Backend sync failed:', e);
      set({ backendConnected: false });
    }
  },

  // OCR Services
  addService: async (newService) => {
    await catalogApi.adminCreateService({
      code: newService.code,
      name: newService.name,
      category: newService.category,
      description: newService.description,
      long_description: newService.longDescription,
      thumbnail: newService.thumbnail,
      supported_file_formats: newService.supportedFileFormats,
      supported_languages: newService.supportedLanguages,
      capabilities: newService.capabilities,
      processing_mode: newService.processingMode,
      display_order: newService.displayOrder,
      starting_price: newService.startingPrice,
      sla: newService.sla,
      status: newService.status,
      supported_doc_type_ids: newService.supportedDocTypeIds,
    });
    await get().syncAdminData();
  },

  updateService: async (id, updated) => {
    await catalogApi.adminUpdateService(id, {
      name: updated.name,
      category: updated.category,
      description: updated.description,
      long_description: updated.longDescription,
      thumbnail: updated.thumbnail,
      supported_file_formats: updated.supportedFileFormats,
      supported_languages: updated.supportedLanguages,
      capabilities: updated.capabilities,
      processing_mode: updated.processingMode,
      display_order: updated.displayOrder,
      starting_price: updated.startingPrice,
      sla: updated.sla,
      status: updated.status,
      supported_doc_type_ids: updated.supportedDocTypeIds,
    });
    await get().syncAdminData();
  },

  deleteService: async (id) => {
    await catalogApi.adminDeleteService(id);
    await get().syncAdminData();
  },

  setServiceStatus: async (id, status) => {
    if (status === 'published' || status === 'draft') {
      await catalogApi.adminPublishService(id, status === 'published');
    } else {
      await catalogApi.adminUpdateService(id, { status });
    }
    await get().syncAdminData();
  },

  // Document Types
  addDocType: async (docType) => {
    await catalogApi.adminCreateDocumentType({
      code: docType.code,
      name: docType.name,
      category: docType.category,
      description: docType.description,
      example_image: docType.exampleImage,
      supported_service_ids: docType.supportedServiceIds,
      status: docType.status,
    });
    await get().syncAdminData();
  },

  updateDocType: async (id, updated) => {
    await catalogApi.adminUpdateDocumentType(id, {
      name: updated.name,
      category: updated.category,
      description: updated.description,
      example_image: updated.exampleImage,
      supported_service_ids: updated.supportedServiceIds,
      status: updated.status,
    });
    await get().syncAdminData();
  },

  deleteDocType: async (id) => {
    await catalogApi.adminDeleteDocumentType(id);
    await get().syncAdminData();
  },

  // Packages
  addPackage: async (pkg) => {
    await packagesApi.adminCreatePackage({
      code: pkg.code,
      name: pkg.name,
      tier: pkg.tier,
      service_id: pkg.serviceId,
      status: pkg.status || 'active',
      initial_version: {
        price: pkg.price,
        currency: pkg.currency,
        quota_type: pkg.quotaType,
        quota_amount: pkg.quotaAmount,
        duration: pkg.duration,
        billing_type: toBackendBillingType(pkg.billingType),
        api_access: pkg.apiAccess,
        batch_processing: pkg.batchProcessing,
        priority_processing: pkg.priorityProcessing,
        auto_renewal: pkg.autoRenewal,
        overage_policy: pkg.overagePolicy,
        features: pkg.features,
      },
    });
    await get().syncAdminData();
  },

  updatePackage: async (id, updated) => {
    await packagesApi.adminUpdatePackage(id, {
      name: updated.name,
      tier: updated.tier,
      status: updated.status,
    });
    if (
      updated.price !== undefined ||
      updated.quotaAmount !== undefined ||
      updated.features !== undefined
    ) {
      await packagesApi.adminCreateVersion(id, {
        price: updated.price ?? 0,
        currency: updated.currency || 'USD',
        quota_type: updated.quotaType || 'Page',
        quota_amount: updated.quotaAmount ?? 1000,
        duration: updated.duration || 'monthly',
        billing_type: toBackendBillingType(updated.billingType),
        api_access: updated.apiAccess ?? true,
        batch_processing: updated.batchProcessing ?? false,
        priority_processing: updated.priorityProcessing ?? false,
        auto_renewal: updated.autoRenewal ?? false,
        overage_policy: updated.overagePolicy || 'block',
        features: updated.features || [],
      });
    }
    await get().syncAdminData();
  },

  deletePackage: async (id) => {
    await packagesApi.adminDeletePackage(id);
    await get().syncAdminData();
  },

  // Customers
  updateCustomer: (id, updated) => {
    set((state) => ({
      customers: state.customers.map((c) => (c.id === id ? { ...c, ...updated } : c)),
    }));
  },

  toggleCustomerStatus: async (id) => {
    const target = get().customers.find((c) => c.id === id);
    if (!target) return;
    const nextBackendStatus = target.status === 'active' ? 'SUSPENDED' : 'ACTIVE';
    await adminApi.updateCustomerStatus(id, nextBackendStatus);
    await get().syncAdminData();
  },

  // Licenses
  generateSingleLicense: async (params) => {
    const pkg = get().packages.find((p) => p.id === params.packageId || p.currentVersionId === params.packageId);
    const packageVersionId = pkg?.currentVersionId || params.packageId;
    const res = await licensesApi.adminGenerateLicense({
      user_id: params.customerId,
      package_version_id: packageVersionId,
      notes: params.notes || 'Admin manual complimentary grant',
    });
    await get().syncAdminData();
    const mapped = mapAdminLicense({
      ...res.license,
      customer_name: get().customers.find((c) => c.id === params.customerId)?.orgName || params.customerId,
    });
    return { license: mapped, rawKey: res.license_key };
  },

  generateBulkLicenses: async (params) => {
    const results: Array<{ license: License; rawKey: string }> = [];
    for (let i = 0; i < params.count; i++) {
      const item = await get().generateSingleLicense({
        customerId: params.customerId,
        serviceId: params.serviceId,
        packageId: params.packageId,
        notes: params.notes || `Batch grant #${i + 1}`,
      });
      results.push(item);
    }
    return results;
  },

  activateLicenseByKey: (key) => {
    const cleanKey = key.trim().toUpperCase();
    licensesApi
      .activateLicense(cleanKey)
      .then(() => get().syncWithBackend())
      .catch((e: any) => console.warn('Backend activation note:', e));

    const target = get().licenses.find(
      (l) => l.licenseKey.toUpperCase() === cleanKey || l.maskedKey.toUpperCase() === cleanKey
    );
    if (!target) {
      return { success: false, message: 'Activation request submitted to server.' };
    }
    if (target.status === 'revoked') {
      return { success: false, message: 'This License Key has been permanently revoked by administrator.' };
    }
    return {
      success: true,
      message: `License for ${target.serviceName} activation submitted!`,
      license: target,
    };
  },

  setLicenseStatus: async (id, status, note) => {
    await adminApi.updateLicenseStatus(id, status, note);
    await get().syncAdminData();
  },

  renewLicense: (id, additionalMonths) => {
    const now = new Date();
    set((state) => ({
      licenses: state.licenses.map((l) => {
        if (l.id === id) {
          const currentExp = new Date(l.expirationDate);
          currentExp.setMonth(currentExp.getMonth() + additionalMonths);
          return {
            ...l,
            expirationDate: currentExp.toISOString().split('T')[0],
            status: 'active' as LicenseStatus,
            history: [
              {
                id: `h-${Date.now()}`,
                action: `Renewed for ${additionalMonths} months`,
                timestamp: now.toLocaleString(),
                actor: 'Customer Self-Service',
                notes: `Extended valid period to ${currentExp.toISOString().split('T')[0]}`,
              },
              ...l.history,
            ],
          };
        }
        return l;
      }),
    }));
  },

  createAdminOperator: async (data) => {
    await adminApi.createOperator(data);
    await get().syncAdminData();
  },

  // Checkout Package
  checkoutPackage: async (params) => {
    const pkg = get().packages.find(
      (p) => p.id === params.packageId || p.currentVersionId === params.packageId || p.code === params.packageId
    );
    if (!pkg) {
      throw new Error('Package not found');
    }
    const versionOrPkgId = pkg.currentVersionId || pkg.id;
    const bOrder = await ordersApi.createOrder(versionOrPkgId);
    const chkRes = await ordersApi.checkout(bOrder.id, { payment_method: params.paymentMethod });
    await get().syncWithBackend();
    return {
      success: true,
      orderId: bOrder.order_number,
      subscriptionId: chkRes.subscription_id || '',
      licenseId: chkRes.license_id || '',
      licenseKey: chkRes.license_key,
      maskedKey: chkRes.masked_key,
    };
  },

  renewSubscription: (id) => {
    set((state) => ({
      subscriptions: state.subscriptions.map((s) => {
        if (s.id === id) {
          const exp = new Date(s.endDate);
          exp.setMonth(exp.getMonth() + 1);
          return {
            ...s,
            endDate: exp.toISOString().split('T')[0],
            status: 'active' as const,
          };
        }
        return s;
      }),
    }));
  },

  cancelSubscription: (id) => {
    set((state) => ({
      subscriptions: state.subscriptions.map((s) =>
        s.id === id ? { ...s, status: 'cancelled' as const, autoRenew: false } : s
      ),
    }));
  },

  // Customer OCR Jobs (real runs executed in OCR playground)
  retryJob: (jobId) => {
    set((state) => {
      const jobs = state.jobs.map((j) => (j.id === jobId ? { ...j, status: 'processing' as const } : j));
      saveStoredJobs(jobs);
      return { jobs };
    });
  },

  submitNewJob: (job) => {
    const now = new Date();
    const newJob: OCRJob = {
      id: job.id || `JOB-${Date.now().toString().slice(-6)}`,
      submissionTime: job.submissionTime || now.toLocaleString(),
      completionTime: job.status === 'completed' || !job.status ? now.toLocaleString() : undefined,
      ...job,
      status: job.status || 'completed',
    };
    set((state) => {
      const updatedExisting = state.jobs.map((j) =>
        j.status === 'processing' && j.extractedDataPreview ? { ...j, status: 'completed' as const } : j
      );
      const jobs = [newJob, ...updatedExisting];
      saveStoredJobs(jobs);
      return { jobs };
    });
  },
}));
