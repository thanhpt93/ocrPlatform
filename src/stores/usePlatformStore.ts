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
  WorkerNode,
  QueueStatus,
  AdminUser,
  AuditLog,
  DailyUsageStat,
  LicenseStatus,
  ServiceStatus,
  CustomerStatus,
} from '@/types';
import {
  initialServices,
  initialDocTypes,
  initialPackages,
  initialCustomers,
  initialSubscriptions,
  initialLicenses,
  initialJobs,
  initialOrders,
  initialInvoices,
  initialPayments,
  initialWorkers,
  initialQueues,
  initialAdminUsers,
  initialAuditLogs,
  initial30DayStats,
} from '@/services/mock/mockData';
import {
  catalogApi,
  packagesApi,
  ordersApi,
  subscriptionsApi,
  licensesApi,
  authApi,
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
  workers: WorkerNode[];
  queues: QueueStatus[];
  adminUsers: AdminUser[];
  auditLogs: AuditLog[];
  dailyStats: DailyUsageStat[];

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
  loginUser: (email: string, password: string) => Promise<boolean>;

  // Actions - OCR Services
  addService: (service: Omit<OCRService, 'id' | 'rating' | 'reviewCount'>) => void;
  updateService: (id: string, service: Partial<OCRService>) => void;
  deleteService: (id: string) => void;
  setServiceStatus: (id: string, status: ServiceStatus) => void;

  // Actions - Document Types
  addDocType: (docType: Omit<DocumentType, 'id'>) => void;
  updateDocType: (id: string, docType: Partial<DocumentType>) => void;
  deleteDocType: (id: string) => void;

  // Actions - Packages
  addPackage: (pkg: Omit<Package, 'id'>) => void;
  updatePackage: (id: string, pkg: Partial<Package>) => void;
  deletePackage: (id: string) => void;

  // Actions - Customers
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  toggleCustomerStatus: (id: string) => void;
  addCustomerMember: (customerId: string, member: { name: string; email: string; role: any }) => void;

  // Actions - Licenses
  generateSingleLicense: (params: {
    customerId: string;
    serviceId: string;
    packageId: string;
    quota: number;
    expirationMonths: number;
  }) => License;
  generateBulkLicenses: (params: {
    customerId: string;
    serviceId: string;
    packageId: string;
    quota: number;
    count: number;
    expirationMonths: number;
  }) => License[];
  activateLicenseByKey: (key: string) => { success: boolean; message: string; license?: License };
  setLicenseStatus: (id: string, status: LicenseStatus, note?: string) => void;
  renewLicense: (id: string, additionalMonths: number) => void;

  // Actions - Subscriptions & Checkout
  checkoutPackage: (params: {
    packageId: string;
    paymentMethod: string;
  }) => { success: boolean; orderId: string; subscriptionId: string; licenseId: string };
  renewSubscription: (id: string) => void;
  cancelSubscription: (id: string) => void;

  // Actions - OCR Jobs
  retryJob: (jobId: string) => void;
  submitNewJob: (job: Omit<OCRJob, 'id' | 'submissionTime' | 'status'>) => void;

  // Actions - System
  toggleWorkerStatus: (workerId: string) => void;
  resetAllData: () => void;
}

const STORAGE_KEY = 'ocr_platform_state_v1';

const loadStoredState = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load local state:', e);
    return null;
  }
};

const saved = loadStoredState();

export const usePlatformStore = create<PlatformState>((set, get) => ({
  services: saved?.services || initialServices,
  docTypes: saved?.docTypes || initialDocTypes,
  packages: saved?.packages || initialPackages,
  customers: saved?.customers || initialCustomers,
  subscriptions: saved?.subscriptions || initialSubscriptions,
  licenses: saved?.licenses || initialLicenses,
  jobs: saved?.jobs || initialJobs,
  orders: saved?.orders || initialOrders,
  invoices: saved?.invoices || initialInvoices,
  payments: saved?.payments || initialPayments,
  workers: saved?.workers || initialWorkers,
  queues: saved?.queues || initialQueues,
  adminUsers: saved?.adminUsers || initialAdminUsers,
  auditLogs: saved?.auditLogs || initialAuditLogs,
  dailyStats: saved?.dailyStats || initial30DayStats,

  activePortal: 'customer',
  activeCustomerId: saved?.activeCustomerId || 'cust-1',
  searchQuery: '',
  backendConnected: false,
  currentUser: api.getCurrentUser(),

  setActivePortal: (portal) => set({ activePortal: portal }),
  setActiveCustomerId: (customerId) => {
    set({ activeCustomerId: customerId });
    persist(get());
  },
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Auth & Sync
  loginUser: async (email, password) => {
    try {
      const res = await authApi.login({ email, password });
      api.setTokens(res.access_token, res.refresh_token, {
        id: res.user_id,
        email: res.email,
        full_name: res.full_name,
        role: res.role,
      });
      set({ currentUser: api.getCurrentUser() });
      await get().syncWithBackend();
      return true;
    } catch (e) {
      console.error('Login failed:', e);
      return false;
    }
  },

  syncWithBackend: async () => {
    try {
      // Auto-authenticate as default demo customer if not authenticated yet
      if (!localStorage.getItem('ocr_access_token')) {
        try {
          const authRes = await authApi.login({
            email: 'alex@techcorp.io',
            password: 'Customer@123456',
          });
          api.setTokens(authRes.access_token, authRes.refresh_token, {
            id: authRes.user_id,
            email: authRes.email,
            full_name: authRes.full_name,
            role: authRes.role,
          });
          set({ currentUser: api.getCurrentUser() });
        } catch (authErr) {
          console.warn('Backend auto-login skipped:', authErr);
        }
      }

      // 1. Fetch Services
      const rawServices = await catalogApi.getServices();
      const mappedServices: OCRService[] = rawServices.map((s) => ({
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
      }));

      // 2. Fetch Document Types
      const rawDocTypes = await catalogApi.getDocumentTypes();
      const mappedDocTypes: DocumentType[] = rawDocTypes.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        description: d.description || '',
        category: d.category,
        exampleImage: d.example_image,
        supportedServiceIds: d.supported_service_ids || [],
        status: d.status,
      }));

      // 3. Fetch Packages
      const rawPackages = await packagesApi.adminGetPackages();
      const mappedPackages: Package[] = rawPackages.map((p) => {
        const cur = p.current_version;
        return {
          id: cur ? cur.id : p.id,
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
      });

      // 4. Fetch Subscriptions & Licenses if authenticated
      let mappedSubs = get().subscriptions;
      let mappedLics = get().licenses;
      let mappedOrders = get().orders;

      try {
        const rawSubs = await subscriptionsApi.getUserSubscriptions();
        if (rawSubs && rawSubs.length > 0) {
          mappedSubs = rawSubs.map((s) => ({
            id: s.id,
            customerId: s.user_id,
            customerName: 'Alex Morgan (TechCorp)',
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
            price: 89,
            billingCycle: 'monthly',
          }));
        }
      } catch (subErr) {
        // graceful fallback
      }

      try {
        const rawLics = await licensesApi.getUserLicenses();
        if (rawLics && rawLics.length > 0) {
          mappedLics = rawLics.map((l) => ({
            id: l.id,
            licenseKey: l.masked_key,
            maskedKey: l.masked_key,
            customerId: l.user_id,
            customerName: 'Alex Morgan (TechCorp)',
            serviceId: l.service_id,
            serviceName: l.service_name || '',
            packageId: l.package_id || '',
            packageName: l.package_name || '',
            subscriptionId: l.subscription_id,
            quota: l.quota,
            usedQuota: l.used_quota,
            startDate: l.issued_at.split('T')[0],
            expirationDate: l.expires_at.split('T')[0],
            status: l.status,
            history: [],
          }));
        }
      } catch (licErr) {
        // graceful fallback
      }

      try {
        const rawOrders = await ordersApi.getUserOrders();
        if (rawOrders && rawOrders.length > 0) {
          mappedOrders = rawOrders.map((o) => ({
            id: o.id,
            orderNumber: o.order_number,
            customerId: o.user_id,
            customerName: 'Alex Morgan (TechCorp)',
            serviceName: o.service_name || '',
            packageName: o.package_name || '',
            amount: o.amount,
            currency: o.currency as any,
            date: o.created_at.split('T')[0],
            status: o.status,
            paymentMethod: 'Credit Card',
          }));
        }
      } catch (ordErr) {
        // graceful fallback
      }

      set({
        services: mappedServices.length > 0 ? mappedServices : get().services,
        docTypes: mappedDocTypes.length > 0 ? mappedDocTypes : get().docTypes,
        packages: mappedPackages.length > 0 ? mappedPackages : get().packages,
        subscriptions: mappedSubs,
        licenses: mappedLics,
        orders: mappedOrders,
        backendConnected: true,
      });

      persist(get());
    } catch (e) {
      console.warn('Backend sync failed, running in offline/mock mode:', e);
      set({ backendConnected: false });
    }
  },

  // OCR Services
  addService: (newService) => {
    const service: OCRService = {
      ...newService,
      id: `srv-${Date.now()}`,
      rating: 5.0,
      reviewCount: 1,
    };
    set((state) => {
      const next = { services: [service, ...state.services] };
      persist({ ...state, ...next });
      return next;
    });

    // Async backend call
    catalogApi.adminCreateService({
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
    }).catch((e) => console.warn('Backend addService skipped:', e));
  },

  updateService: (id, updated) => {
    set((state) => {
      const next = {
        services: state.services.map((s) => (s.id === id ? { ...s, ...updated } : s)),
      };
      persist({ ...state, ...next });
      return next;
    });

    catalogApi.adminUpdateService(id, {
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
    }).catch((e) => console.warn('Backend updateService skipped:', e));
  },

  deleteService: (id) => {
    set((state) => {
      const next = { services: state.services.filter((s) => s.id !== id) };
      persist({ ...state, ...next });
      return next;
    });
  },

  setServiceStatus: (id, status) => {
    set((state) => {
      const next = {
        services: state.services.map((s) => (s.id === id ? { ...s, status } : s)),
      };
      persist({ ...state, ...next });
      return next;
    });
    if (status === 'published' || status === 'draft') {
      catalogApi.adminPublishService(id, status === 'published').catch((e) => console.warn(e));
    }
  },

  // Document Types
  addDocType: (docType) => {
    const item: DocumentType = {
      ...docType,
      id: `doc-${Date.now()}`,
    };
    set((state) => {
      const next = { docTypes: [...state.docTypes, item] };
      persist({ ...state, ...next });
      return next;
    });
    catalogApi.adminCreateDocumentType({
      code: docType.code,
      name: docType.name,
      description: docType.description,
      category: docType.category,
      example_image: docType.exampleImage,
      status: docType.status,
    }).catch((e) => console.warn(e));
  },

  updateDocType: (id, docType) => {
    set((state) => {
      const next = {
        docTypes: state.docTypes.map((d) => (d.id === id ? { ...d, ...docType } : d)),
      };
      persist({ ...state, ...next });
      return next;
    });
    catalogApi.adminUpdateDocumentType(id, {
      name: docType.name,
      description: docType.description,
      category: docType.category,
      example_image: docType.exampleImage,
      status: docType.status,
    }).catch((e) => console.warn(e));
  },

  deleteDocType: (id) => {
    set((state) => {
      const next = { docTypes: state.docTypes.filter((d) => d.id !== id) };
      persist({ ...state, ...next });
      return next;
    });
  },

  // Packages
  addPackage: (pkg) => {
    const item: Package = {
      ...pkg,
      id: `pkg-${Date.now()}`,
    };
    set((state) => {
      const next = { packages: [item, ...state.packages] };
      persist({ ...state, ...next });
      return next;
    });
  },

  updatePackage: (id, pkg) => {
    set((state) => {
      const next = {
        packages: state.packages.map((p) => (p.id === id ? { ...p, ...pkg } : p)),
      };
      persist({ ...state, ...next });
      return next;
    });
    packagesApi.adminUpdatePackage(id, {
      name: pkg.name,
      tier: pkg.tier,
      status: pkg.status,
    }).catch((e) => console.warn(e));
  },

  deletePackage: (id) => {
    set((state) => {
      const next = { packages: state.packages.filter((p) => p.id !== id) };
      persist({ ...state, ...next });
      return next;
    });
  },

  // Customers
  updateCustomer: (id, customer) => {
    set((state) => {
      const next = {
        customers: state.customers.map((c) => (c.id === id ? { ...c, ...customer } : c)),
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  toggleCustomerStatus: (id) => {
    set((state) => {
      const next = {
        customers: state.customers.map((c) => {
          if (c.id === id) {
            const newStatus = c.status === 'active' ? 'suspended' : 'active';
            return { ...c, status: newStatus as CustomerStatus };
          }
          return c;
        }),
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  addCustomerMember: (customerId, member) => {
    const newMember = {
      ...member,
      id: `mem-${Date.now()}`,
      status: 'active' as const,
      addedDate: new Date().toISOString().split('T')[0],
    };
    set((state) => {
      const next = {
        customers: state.customers.map((c) => {
          if (c.id === customerId) {
            return {
              ...c,
              memberCount: c.memberCount + 1,
              members: [newMember, ...c.members],
            };
          }
          return c;
        }),
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  // Licenses
  generateSingleLicense: (params) => {
    const now = new Date();
    const expDate = new Date();
    expDate.setMonth(expDate.getMonth() + params.expirationMonths);

    const customer = get().customers.find((c) => c.id === params.customerId);
    const service = get().services.find((s) => s.id === params.serviceId);
    const pkg = get().packages.find((p) => p.id === params.packageId);

    const randK = Math.random().toString(36).substring(2, 10).toUpperCase();
    const fullKey = `OCR-2026-${randK.slice(0, 4)}-${randK.slice(4, 8)}-${Date.now().toString().slice(-4)}`;
    const masked = `OCR-2026-****-****-${Date.now().toString().slice(-4)}`;

    const newLic: License = {
      id: `lic-${Date.now()}`,
      licenseKey: fullKey,
      maskedKey: masked,
      customerId: params.customerId,
      customerName: customer ? customer.orgName : 'Direct Customer',
      serviceId: params.serviceId,
      serviceName: service ? service.name : 'OCR Service',
      packageId: params.packageId,
      packageName: pkg ? pkg.name : 'Package Plan',
      quota: params.quota,
      usedQuota: 0,
      startDate: now.toISOString().split('T')[0],
      expirationDate: expDate.toISOString().split('T')[0],
      status: 'active',
      history: [
        {
          id: `h-${Date.now()}`,
          action: 'Created',
          timestamp: now.toLocaleString(),
          actor: 'System Admin',
          notes: 'License provisioned directly via Admin Console',
        },
      ],
    };

    set((state) => {
      const next = { licenses: [newLic, ...state.licenses] };
      persist({ ...state, ...next });
      return next;
    });

    return newLic;
  },

  generateBulkLicenses: (params) => {
    const results: License[] = [];
    for (let i = 0; i < params.count; i++) {
      const lic = get().generateSingleLicense({
        customerId: params.customerId,
        serviceId: params.serviceId,
        packageId: params.packageId,
        quota: params.quota,
        expirationMonths: params.expirationMonths,
      });
      results.push(lic);
    }
    return results;
  },

  activateLicenseByKey: (key) => {
    const cleanKey = key.trim().toUpperCase();
    
    // Call backend activation asynchronously
    licensesApi.activateLicense(cleanKey).catch((e) => console.warn('Backend activation note:', e));

    const state = get();
    const target = state.licenses.find(
      (l) => l.licenseKey.toUpperCase() === cleanKey || l.maskedKey.toUpperCase() === cleanKey
    );

    if (!target) {
      return { success: false, message: 'Invalid or unregistered License Key. Please check the code.' };
    }

    if (target.status === 'revoked') {
      return { success: false, message: 'This License Key has been permanently revoked by administrator.' };
    }

    const now = new Date();
    const updated = state.licenses.map((l) => {
      if (l.id === target.id) {
        return {
          ...l,
          status: 'active' as LicenseStatus,
          history: [
            {
              id: `h-${Date.now()}`,
              action: 'Activated by User',
              timestamp: now.toLocaleString(),
              actor: 'Client Web Portal',
              notes: 'Successfully activated license via Key Entry Modal',
            },
            ...l.history,
          ],
        };
      }
      return l;
    });

    set({ licenses: updated });
    persist(get());

    return {
      success: true,
      message: `License for ${target.serviceName} successfully activated!`,
      license: target,
    };
  },

  setLicenseStatus: (id, status, note) => {
    const now = new Date();
    set((state) => {
      const next = {
        licenses: state.licenses.map((l) => {
          if (l.id === id) {
            return {
              ...l,
              status,
              history: [
                {
                  id: `h-${Date.now()}`,
                  action: `Status changed to ${status}`,
                  timestamp: now.toLocaleString(),
                  actor: 'Operations Admin',
                  notes: note || `Administrative status change to ${status}`,
                },
                ...l.history,
              ],
            };
          }
          return l;
        }),
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  renewLicense: (id, additionalMonths) => {
    const now = new Date();
    set((state) => {
      const next = {
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
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  // Checkout Package
  checkoutPackage: (params) => {
    const state = get();
    const pkg = state.packages.find((p) => p.id === params.packageId || p.code === params.packageId);
    if (!pkg) {
      throw new Error('Package not found');
    }

    const customer = state.customers.find((c) => c.id === state.activeCustomerId) || state.customers[0];
    const service = state.services.find((s) => s.id === pkg.serviceId);

    const now = new Date();
    const expDate = new Date();
    expDate.setMonth(expDate.getMonth() + 1);

    const orderId = `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoiceId = `INV-2026-${Math.floor(100 + Math.random() * 900)}`;
    const subId = `SUB-2026-${Math.floor(100 + Math.random() * 900)}`;
    const licId = `LIC-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;

    // Order
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: orderId,
      customerId: customer.id,
      customerName: customer.orgName,
      serviceName: service ? service.name : pkg.serviceName,
      packageName: pkg.name,
      amount: pkg.price,
      currency: pkg.currency,
      date: now.toISOString().split('T')[0],
      status: 'completed',
      paymentMethod: params.paymentMethod,
      invoiceId,
    };

    // Invoice
    const newInvoice: Invoice = {
      id: invoiceId,
      invoiceNumber: invoiceId,
      orderId: newOrder.id,
      customerId: customer.id,
      customerName: customer.orgName,
      amount: pkg.price,
      currency: pkg.currency,
      issueDate: now.toISOString().split('T')[0],
      dueDate: expDate.toISOString().split('T')[0],
      paidDate: now.toISOString().split('T')[0],
      status: 'paid',
    };

    // Payment
    const newPayment: Payment = {
      id: `pay-${Date.now()}`,
      paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
      orderId: newOrder.id,
      orderNumber: orderId,
      customerId: customer.id,
      customerName: customer.orgName,
      amount: pkg.price,
      currency: pkg.currency,
      method: params.paymentMethod,
      date: now.toLocaleString(),
      status: 'successful',
    };

    // Subscription
    const newSub: Subscription = {
      id: subId,
      customerId: customer.id,
      customerName: customer.orgName,
      serviceId: pkg.serviceId,
      serviceName: pkg.serviceName,
      packageId: pkg.id,
      packageName: pkg.name,
      startDate: now.toISOString().split('T')[0],
      endDate: expDate.toISOString().split('T')[0],
      autoRenew: true,
      totalQuota: pkg.quotaAmount,
      usedQuota: 0,
      remainingQuota: pkg.quotaAmount,
      status: 'active',
      price: pkg.price,
      billingCycle: 'monthly',
    };

    // License
    const randK = Math.random().toString(36).substring(2, 10).toUpperCase();
    const fullKey = `OCR-2026-${randK.slice(0, 4)}-${randK.slice(4, 8)}-${Date.now().toString().slice(-4)}`;
    const masked = `OCR-2026-****-****-${Date.now().toString().slice(-4)}`;

    const newLic: License = {
      id: licId,
      licenseKey: fullKey,
      maskedKey: masked,
      customerId: customer.id,
      customerName: customer.orgName,
      serviceId: pkg.serviceId,
      serviceName: pkg.serviceName,
      packageId: pkg.id,
      packageName: pkg.name,
      subscriptionId: subId,
      quota: pkg.quotaAmount,
      usedQuota: 0,
      startDate: now.toISOString().split('T')[0],
      expirationDate: expDate.toISOString().split('T')[0],
      status: 'active',
      history: [
        {
          id: `h-${Date.now()}`,
          action: 'Issued & Activated',
          timestamp: now.toLocaleString(),
          actor: 'Instant Checkout Provisioner',
          notes: `Activated package: ${pkg.name}`,
        },
      ],
    };

    set((s) => {
      const next = {
        orders: [newOrder, ...s.orders],
        invoices: [newInvoice, ...s.invoices],
        payments: [newPayment, ...s.payments],
        subscriptions: [newSub, ...s.subscriptions],
        licenses: [newLic, ...s.licenses],
      };
      persist({ ...s, ...next });
      return next;
    });

    // Fire real backend order & checkout API
    ordersApi.createOrder(pkg.id).then((bOrder) => {
      ordersApi.checkout(bOrder.id, { payment_method: params.paymentMethod }).then(() => {
        get().syncWithBackend();
      });
    }).catch((e) => console.warn('Backend order checkout fallback:', e));

    return {
      success: true,
      orderId,
      subscriptionId: subId,
      licenseId: licId,
    };
  },

  renewSubscription: (id) => {
    set((state) => {
      const next = {
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
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  cancelSubscription: (id) => {
    set((state) => {
      const next = {
        subscriptions: state.subscriptions.map((s) => (s.id === id ? { ...s, status: 'cancelled' as const } : s)),
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  // Jobs
  retryJob: (jobId) => {
    set((state) => {
      const next = {
        jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, status: 'queued' as const, errorReason: undefined } : j)),
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  submitNewJob: (job) => {
    const newJob: OCRJob = {
      ...job,
      id: `JOB-2026-${Date.now().toString().slice(-5)}`,
      submissionTime: 'Just now',
      status: 'queued',
      confidenceScore: 0.99,
      extractedDataPreview: {
        document_number: 'TX-9902182',
        total_amount: '4,520.00 USD',
        confidence: 0.992,
      },
    };
    set((state) => {
      const next = { jobs: [newJob, ...state.jobs] };
      persist({ ...state, ...next });
      return next;
    });
  },

  // Workers
  toggleWorkerStatus: (workerId) => {
    set((state) => {
      const next = {
        workers: state.workers.map((w) => {
          if (w.id === workerId) {
            const newStatus = w.status === 'online' ? 'offline' : 'online';
            return { ...w, status: newStatus as WorkerNode['status'] };
          }
          return w;
        }),
      };
      persist({ ...state, ...next });
      return next;
    });
  },

  resetAllData: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      services: initialServices,
      docTypes: initialDocTypes,
      packages: initialPackages,
      customers: initialCustomers,
      subscriptions: initialSubscriptions,
      licenses: initialLicenses,
      jobs: initialJobs,
      orders: initialOrders,
      invoices: initialInvoices,
      payments: initialPayments,
      workers: initialWorkers,
      queues: initialQueues,
      adminUsers: initialAdminUsers,
      auditLogs: initialAuditLogs,
      dailyStats: initial30DayStats,
      activePortal: 'customer',
      activeCustomerId: 'cust-1',
    });
  },
}));

function persist(state: Partial<PlatformState>) {
  if (typeof window === 'undefined') return;
  try {
    const toSave = {
      services: state.services,
      docTypes: state.docTypes,
      packages: state.packages,
      customers: state.customers,
      subscriptions: state.subscriptions,
      licenses: state.licenses,
      jobs: state.jobs,
      orders: state.orders,
      invoices: state.invoices,
      payments: state.payments,
      workers: state.workers,
      queues: state.queues,
      adminUsers: state.adminUsers,
      auditLogs: state.auditLogs,
      dailyStats: state.dailyStats,
      activeCustomerId: state.activeCustomerId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('Failed to save local state:', e);
  }
}
