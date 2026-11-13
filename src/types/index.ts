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
export type BillingType = 'one_time' | 'recurring' | 'prepaid' | 'postpaid';
export type OveragePolicy = 'block' | 'charge_per_unit' | 'grace_period';

export interface Package {
  id: string;
  currentVersionId?: string;
  versionNumber?: number;
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

export type CustomerTier = 'Standard' | 'Starter' | 'Professional' | 'Premium' | 'Enterprise' | 'Custom';
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
  fullName?: string;
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
  totalSpend?: number;
  monthlySpend: number;
}

export type SubscriptionStatus = 'active' | 'pending' | 'expiring' | 'expired' | 'cancelled' | 'suspended';

export interface Subscription {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
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
  currency?: string;
  billingCycle: string;
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
  customerEmail?: string;
  serviceId: string;
  serviceName: string;
  packageId: string;
  packageName: string;
  subscriptionId?: string;
  quota: number;
  usedQuota: number;
  remainingQuota?: number;
  startDate: string;
  expirationDate: string;
  status: LicenseStatus;
  history: LicenseHistoryItem[];
}

export type JobStatus = 'completed' | 'processing' | 'queued' | 'failed';

export interface SegmentationInfo {
  detected: boolean;
  method: string;
  bbox: number[];
  original_dimensions: string;
  cropped_dimensions: string;
  crop_area_ratio: number;
  rotation_applied_deg?: number;
  pipeline_mode?: string;
  ocr_lines_count?: number;
  stage_timings_ms?: Record<string, number>;
}

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
  originalImageUrl?: string;
  croppedImageUrl?: string;
  segmentationInfo?: SegmentationInfo;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  serviceName: string;
  packageName: string;
  amount: number;
  currency: 'USD' | 'VND';
  date: string;
  status: 'completed' | 'pending' | 'failed' | 'cancelled' | 'refunded';
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
  customerEmail?: string;
  amount: number;
  currency: 'USD' | 'VND';
  method: string;
  date: string;
  status: 'successful' | 'pending' | 'processing' | 'failed';
  transactionReference?: string;
  failureReason?: string;
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
  role: string;
  status: 'active' | 'suspended' | 'pending' | 'inactive';
  createdAt?: string;
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

export interface AdminDashboardStats {
  total_customers: number;
  active_services: number;
  total_services: number;
  active_subscriptions: number;
  active_licenses: number;
  total_usage_units: number;
  total_ocr_jobs: number;
  total_revenue: number;
  monthly_revenue: Array<{
    month: string;
    revenue: number;
    orders: number;
    volume: number;
  }>;
  service_popularity: Array<{
    service_id: string;
    name: string;
    subscriptions: number;
    usage_units: number;
    percentage: number;
  }>;
  daily_usage: Array<{
    date: string;
    units: number;
    jobs: number;
  }>;
  customer_growth: Array<{
    month: string;
    total: number;
    new_customers: number;
  }>;
}

export interface AdminUsageRecord {
  id: string;
  job_id?: string | null;
  user_id: string;
  customer_name: string;
  customer_email: string;
  license_id: string;
  masked_key?: string | null;
  service_id: string;
  service_name?: string | null;
  amount: number;
  quota_type: string;
  unit_cost: number;
  created_at: string;
}

export interface AdminLoadedModel {
  name?: string;
  model?: string;
  size?: number;
  size_vram?: number;
  expires_at?: string;
}

export interface AdminMonitoring {
  backend_status: string;
  database_status: string;
  database_dialect: string;
  ollama_status: string;
  ollama_base_url: string;
  active_model: string;
  installed_models: string[];
  loaded_models: AdminLoadedModel[];
  total_jobs_processed: number;
  jobs_last_24h: number;
  active_licenses: number;
  active_api_credentials: number;
  recent_jobs: AdminUsageRecord[];
}

export interface AdminSystemConfig {
  ollama_base_url: string;
  ollama_model: string;
  ollama_num_ctx: number;
  ollama_num_predict: number;
  ollama_timeout_seconds: number;
  vlm_max_image_dimension: number;
  database_backend: string;
  access_token_expire_minutes: number;
  refresh_token_expire_days: number;
}
