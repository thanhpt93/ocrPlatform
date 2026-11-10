export type ServiceStatus = 'draft' | 'published' | 'archived';
export type ProcessingMode = 'synchronous' | 'asynchronous' | 'batch';

export interface OCRService {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  longDescription?: string;
  thumbnail: string;
  supportedFileFormats: string[];
  supportedLanguages: string[];
  capabilities: string[];
  supportedDocTypeIds: string[];
  processingMode: ProcessingMode;
  displayOrder: number;
  status: ServiceStatus;
  startingPrice: number;
  rating: number;
  reviewCount: number;
  sla: string;
}

export type DocTypeCategory = 'Financial' | 'Legal' | 'Identity' | 'Logistics' | 'Healthcare' | 'General';

export interface DocumentType {
  id: string;
  code: string;
  name: string;
  description: string;
  category: DocTypeCategory;
  exampleImage?: string;
  supportedServiceIds: string[];
  status: 'active' | 'inactive';
}

export type QuotaType = 'Page' | 'Document' | 'Credit';
export type PackageTier = 'Starter' | 'Professional' | 'Enterprise' | 'Custom';
export type Duration = 'monthly' | 'yearly' | 'pay_as_you_go';
export type BillingType = 'prepaid' | 'postpaid';
export type OveragePolicy = 'block' | 'charge_per_unit' | 'grace_period';

export interface Package {
  id: string;
  code: string;
  name: string;
  tier: PackageTier;
  serviceId: string;
  serviceName: string;
  price: number;
  currency: 'USD' | 'VND';
  quotaType: QuotaType;
  quotaAmount: number;
  duration: Duration;
  billingType: BillingType;
  apiAccess: boolean;
  batchProcessing: boolean;
  priorityProcessing: boolean;
  autoRenewal: boolean;
  overagePolicy: OveragePolicy;
  status: 'active' | 'inactive' | 'archived';
  features: string[];
  recommended?: boolean;
}

export type CustomerTier = 'Standard' | 'Premium' | 'Enterprise';
export type CustomerStatus = 'active' | 'suspended' | 'pending';

export interface CustomerMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Developer' | 'Viewer';
  status: 'active' | 'invited';
  addedDate: string;
}

export interface Customer {
  id: string;
  orgName: string;
  email: string;
  phone: string;
  address?: string;
  taxId?: string;
  registrationDate: string;
  tier: CustomerTier;
  status: CustomerStatus;
  memberCount: number;
  members: CustomerMember[];
  activeSubscriptionsCount: number;
  activeLicensesCount: number;
  totalUsagePages: number;
  monthlySpend: number;
}

export type SubscriptionStatus = 'active' | 'expiring' | 'expired' | 'cancelled';

export interface Subscription {
  id: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  packageId: string;
  packageName: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  totalQuota: number;
  usedQuota: number;
  remainingQuota: number;
  status: SubscriptionStatus;
  price: number;
  billingCycle: 'monthly' | 'yearly';
}

export type LicenseStatus = 'pending' | 'active' | 'suspended' | 'expired' | 'revoked';

export interface LicenseHistoryItem {
  id: string;
  action: string;
  timestamp: string;
  actor: string;
  notes: string;
}

export interface License {
  id: string;
  licenseKey: string;
  maskedKey: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  packageId: string;
  packageName: string;
  subscriptionId?: string;
  quota: number;
  usedQuota: number;
  startDate: string;
  expirationDate: string;
  status: LicenseStatus;
  history: LicenseHistoryItem[];
}

export type JobStatus = 'completed' | 'processing' | 'queued' | 'failed';

export interface OCRJob {
  id: string;
  customerId: string;
  customerName: string;
  fileName: string;
  fileSize: string;
  fileType: string;
  serviceId: string;
  serviceName: string;
  docTypeId: string;
  docTypeName: string;
  submissionTime: string;
  completionTime?: string;
  pageCount: number;
  processingDurationMs: number;
  status: JobStatus;
  confidenceScore?: number;
  errorReason?: string;
  extractedDataPreview?: Record<string, any>;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  serviceName: string;
  packageName: string;
  amount: number;
  currency: 'USD' | 'VND';
  date: string;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  paymentMethod: string;
  invoiceId?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  customerName: string;
  amount: number;
  currency: 'USD' | 'VND';
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  status: 'paid' | 'unpaid' | 'overdue';
  downloadUrl?: string;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  currency: 'USD' | 'VND';
  method: string;
  date: string;
  status: 'successful' | 'processing' | 'failed';
}

export interface WorkerNode {
  id: string;
  name: string;
  type: 'GPU Worker' | 'CPU Worker';
  ipAddress: string;
  status: 'online' | 'busy' | 'offline' | 'degraded';
  currentTask?: string;
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage?: number;
  processedCount: number;
  uptime: string;
}

export interface QueueStatus {
  name: string;
  type: 'High Priority' | 'Standard' | 'Batch';
  activeCount: number;
  queuedCount: number;
  avgLatencyMs: number;
  status: 'healthy' | 'congested';
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'Super Admin' | 'Service Manager' | 'Operations' | 'Support Specialist';
  status: 'active' | 'inactive';
  lastLogin: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface DailyUsageStat {
  date: string;
  pages: number;
  jobs: number;
  failed: number;
  avgDurationMs: number;
}
