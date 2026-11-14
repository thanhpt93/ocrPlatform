import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  FileCheck2,
  Gauge,
  KeyRound,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { api } from '@/services/api/client';
import { StatCard } from '@/components/common/StatCard';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, formatDateTime, formatDate } from '@/utils/formatters';

const PIE_COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];

export const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    customers,
    activeCustomerId,
    subscriptions,
    licenses,
    jobs,
    dailyStats,
    customerUsageSummary,
    currentUser,
    syncWithBackend,
  } = usePlatformStore();

  useEffect(() => {
    syncWithBackend();
  }, [syncWithBackend]);

  const isAuthenticated = Boolean(api.getAccessToken());
  const effectiveCustomerId = isAuthenticated ? (currentUser?.id || activeCustomerId) : '';
  const matchedCustomer = effectiveCustomerId
    ? customers.find((c) => c.id === effectiveCustomerId)
    : undefined;

  const displayOrgName = isAuthenticated
    ? currentUser?.profile?.company_name ||
      currentUser?.company_name ||
      currentUser?.full_name ||
      currentUser?.email ||
      matchedCustomer?.orgName ||
      'My Organization'
    : 'Guest';

  // Customer-specific real records from backend
  const customerSubs = useMemo(
    () => (effectiveCustomerId ? subscriptions.filter((s) => s.customerId === effectiveCustomerId) : []),
    [subscriptions, effectiveCustomerId]
  );
  const customerLicenses = useMemo(
    () => (effectiveCustomerId ? licenses.filter((l) => l.customerId === effectiveCustomerId) : []),
    [licenses, effectiveCustomerId]
  );
  const customerJobs = useMemo(
    () => (effectiveCustomerId ? jobs.filter((j) => j.customerId === effectiveCustomerId) : []),
    [jobs, effectiveCustomerId]
  );

  // Real aggregated KPIs
  const activeSubsCount = customerSubs.filter((s) => s.status === 'active' || s.status === 'expiring').length;
  const activeLicensesCount =
    customerUsageSummary?.active_licenses ?? customerLicenses.filter((l) => l.status === 'active').length;

  const activeServiceIds = new Set<string>([
    ...customerSubs
      .filter((s) => s.status === 'active' || s.status === 'expiring')
      .map((s) => s.serviceId)
      .filter(Boolean),
    ...customerLicenses
      .filter((l) => l.status === 'active')
      .map((l) => l.serviceId)
      .filter(Boolean),
  ]);
  const activeServicesCount = activeServiceIds.size;

  const totalQuota =
    customerUsageSummary?.total_quota ??
    customerLicenses.reduce((acc, curr) => acc + (curr.quota || 0), 0);
  const usedQuota =
    customerUsageSummary?.used_quota ??
    customerLicenses.reduce((acc, curr) => acc + (curr.usedQuota || 0), 0);
  const remainingQuota =
    customerUsageSummary?.remaining_quota ??
    customerLicenses.reduce(
      (acc, curr) => acc + (curr.remainingQuota ?? Math.max(0, (curr.quota || 0) - (curr.usedQuota || 0))),
      0
    );
  const quotaPercent = totalQuota > 0 ? Math.min(100, Math.round((usedQuota / totalQuota) * 100)) : 0;
  const totalJobsCount = customerUsageSummary?.total_jobs ?? customerJobs.length;
  const hasActiveAccess = activeSubsCount > 0 || activeLicensesCount > 0 || totalQuota > 0;

  // Real Chart 1: Recent 14 days from customer's own UsageRecords
  const recentStats = useMemo(
    () =>
      dailyStats.slice(-14).map((d) => ({
        date: d.date.slice(5),
        pages: d.pages,
        jobs: d.jobs,
      })),
    [dailyStats]
  );
  const hasRecentUsage = recentStats.some((d) => d.pages > 0 || d.jobs > 0);

  // Real Chart 2: Real service breakdown from UsageRecords
  const serviceDistribution = useMemo(
    () =>
      (customerUsageSummary?.service_breakdown || []).map((item, idx) => ({
        serviceId: item.service_id,
        name: item.service_name,
        value: item.percentage,
        units: item.usage_units,
        jobsCount: item.jobs_count,
        color: PIE_COLORS[idx % PIE_COLORS.length],
      })),
    [customerUsageSummary]
  );

  // Real Quota & Expiration Alerts derived strictly from customerLicenses & customerSubs
  const alerts = useMemo(() => {
    const items: Array<{
      id: string;
      severity: 'danger' | 'warning' | 'info';
      title: string;
      detail: string;
    }> = [];
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    for (const lic of customerLicenses) {
      const rem = lic.remainingQuota ?? Math.max(0, (lic.quota || 0) - (lic.usedQuota || 0));
      if (lic.status === 'active' && lic.quota > 0 && rem === 0) {
        items.push({
          id: `exhausted-${lic.id}`,
          severity: 'danger',
          title: `Hết hạn mức: ${lic.serviceName || lic.packageName}`,
          detail: `License ${lic.maskedKey} đã dùng hết ${formatNumber(lic.quota)}/${formatNumber(lic.quota)} lượt.`,
        });
      } else if (lic.status === 'active' && lic.quota > 0 && rem / lic.quota <= 0.15) {
        items.push({
          id: `low-${lic.id}`,
          severity: 'warning',
          title: `Sắp hết hạn mức: ${lic.serviceName || lic.packageName}`,
          detail: `License ${lic.maskedKey} chỉ còn ${formatNumber(rem)}/${formatNumber(lic.quota)} lượt.`,
        });
      }

      if (lic.status === 'active' && lic.expirationDate) {
        const expMs = new Date(lic.expirationDate).getTime();
        if (!Number.isNaN(expMs) && expMs > now && expMs - now <= sevenDaysMs) {
          items.push({
            id: `expiring-${lic.id}`,
            severity: 'warning',
            title: `License sắp hết hạn`,
            detail: `${lic.maskedKey} (${lic.serviceName || lic.packageName}) sẽ hết hạn vào ${formatDate(lic.expirationDate)}.`,
          });
        }
      } else if (lic.status === 'expired' || lic.status === 'suspended' || lic.status === 'revoked') {
        items.push({
          id: `status-${lic.id}`,
          severity: lic.status === 'revoked' ? 'danger' : 'info',
          title: `License ${lic.status}: ${lic.maskedKey}`,
          detail: `${lic.serviceName || lic.packageName} không còn hoạt động.`,
        });
      }
    }

    return items;
  }, [customerLicenses]);

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'Dashboard' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">
            Welcome back, {displayOrgName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time OCR processing overview, quota consumption, and active licenses.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate('/app/marketplace')} variant="primary" size="sm">
            <Sparkles className="h-4 w-4 mr-1 text-blue-200" />
            Explore OCR Marketplace
          </Button>
          <Button onClick={() => navigate('/app/jobs')} variant="outline" size="sm">
            View All Jobs
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid (100% real data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active OCR Services"
          value={activeServicesCount}
          subtitle={
            activeSubsCount > 0
              ? `${activeSubsCount} active subscription(s)`
              : activeLicensesCount > 0
              ? `${activeLicensesCount} active license(s)`
              : 'No active subscription'
          }
          icon={<Layers className="h-5 w-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Units Processed"
          value={formatNumber(usedQuota)}
          subtitle={
            totalJobsCount > 0
              ? `${formatNumber(totalJobsCount)} recorded job(s)`
              : 'No usage recorded'
          }
          icon={<FileCheck2 className="h-5 w-5" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title="Remaining Quota"
          value={`${formatNumber(remainingQuota)} units`}
          subtitle={
            totalQuota > 0
              ? `${quotaPercent}% consumed of ${formatNumber(totalQuota)}`
              : 'Quota not provisioned'
          }
          icon={<Gauge className="h-5 w-5" />}
          iconBgColor="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Active Licenses"
          value={activeLicensesCount}
          subtitle={activeLicensesCount > 0 ? 'Provisioned License Keys' : 'No active licenses'}
          icon={<KeyRound className="h-5 w-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Onboarding Banner for New Customers */}
      {!hasActiveAccess && (
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white p-6 shadow-xs">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {isAuthenticated
                    ? 'Chào mừng bạn đến với ocrPlatform! Tài khoản mới đã sẵn sàng.'
                    : 'Chào mừng bạn đến với ocrPlatform! Vui lòng đăng nhập để bắt đầu.'}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                  {isAuthenticated
                    ? 'Tài khoản của bạn hiện ở trạng thái sạch, chưa có gói dịch vụ nào. Hãy vào OCR Marketplace để chọn gói dịch vụ (Page, Document hoặc Credit), thực hiện quy trình Đặt hàng & Thanh toán để hệ thống tự động cấp phát Gói đăng ký (Subscription), Giấy phép (License) và API Key.'
                    : 'Đăng nhập hoặc đăng ký tài khoản khách hàng để mua gói OCR, nhận License Key và theo dõi dữ liệu xử lý thực tế.'}
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate(isAuthenticated ? '/app/marketplace' : '/login')}
              variant="primary"
              size="md"
              className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {isAuthenticated ? 'Khám phá OCR Marketplace' : 'Đăng nhập ngay'}
            </Button>
          </div>
        </Card>
      )}

      {/* Charts Section (Only displayed when customer has active access or real usage) */}
      {(hasActiveAccess || hasRecentUsage || serviceDistribution.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Usage Trend Area Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>OCR Processing Volume Trend</CardTitle>
                <CardDescription>Real daily units processed over the last 14 days</CardDescription>
              </div>
              <Badge variant="default" size="sm">
                <TrendingUp className="h-3 w-3 mr-1" /> Live DB
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full pt-2">
                {hasRecentUsage ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={recentStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="customerPagesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                        itemStyle={{ color: '#93c5fd' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="pages"
                        name="Units Processed"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#customerPagesGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-4">
                    Chưa có lượt xử lý OCR nào được ghi nhận trong 14 ngày qua.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Breakdown by Service */}
          <Card>
            <CardHeader>
              <CardTitle>Usage by OCR Service</CardTitle>
              <CardDescription>Real share of quota consumption</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              {serviceDistribution.length > 0 ? (
                <>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={serviceDistribution}
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                        >
                          {serviceDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any) => `${val}%`}
                          contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full mt-2 space-y-1.5">
                    {serviceDistribution.map((s) => (
                      <div key={s.serviceId} className="flex items-center justify-between text-xs text-slate-600">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="truncate max-w-[150px]">{s.name}</span>
                        </div>
                        <span className="font-semibold text-slate-800 shrink-0">
                          {s.value}% ({formatNumber(s.units)} units)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-52 flex items-center justify-center text-xs text-slate-400 text-center px-4">
                  Chưa có lượt sử dụng dịch vụ OCR nào được ghi nhận.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts and Recent Jobs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts & Advisories */}
        <div className="space-y-4">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-slate-600" />
                <CardTitle className="text-slate-800 text-sm">Quota & Expiration Alerts</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!hasActiveAccess && alerts.length === 0 ? (
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                  <ShieldCheck className="h-5 w-5 text-emerald-500 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">Tài khoản bình thường</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Không có cảnh báo hạn mức hoặc hết hạn nào cho tài khoản này.
                  </p>
                </div>
              ) : alerts.length > 0 ? (
                <div className="space-y-2.5">
                  {alerts.slice(0, 4).map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 rounded-lg border text-xs ${
                        alert.severity === 'danger'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : alert.severity === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold mb-0.5">
                        {alert.severity === 'danger' ? (
                          <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                        <span className="truncate">{alert.title}</span>
                      </div>
                      <p className="text-[11px] opacity-85">{alert.detail}</p>
                    </div>
                  ))}
                  <Button onClick={() => navigate('/app/licenses')} variant="outline" size="xs" className="w-full">
                    Manage Licenses
                  </Button>
                </div>
              ) : (
                <div className="p-3 bg-white rounded-lg border border-emerald-200/80 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-800">Active Service Status</span>
                    <Badge variant="success" size="sm">Healthy</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2">
                    {formatNumber(remainingQuota)} / {formatNumber(totalQuota)} units remaining across {activeLicensesCount} active license(s).
                  </p>
                  <Button onClick={() => navigate('/app/licenses')} variant="outline" size="xs" className="w-full">
                    Manage Licenses
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent OCR Jobs Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Recent OCR Jobs</CardTitle>
              <CardDescription>Latest files processed across your account</CardDescription>
            </div>
            <Button onClick={() => navigate('/app/jobs')} variant="ghost" size="sm">
              View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-4">Job ID</th>
                    <th className="py-2.5 px-4">File Name</th>
                    <th className="py-2.5 px-4">OCR Service</th>
                    <th className="py-2.5 px-4">Units</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                        Chưa có tác vụ OCR nào được xử lý cho tài khoản này.
                      </td>
                    </tr>
                  ) : (
                    customerJobs.slice(0, 5).map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-blue-600">{job.id}</td>
                        <td className="py-3 px-4 font-medium text-slate-800 truncate max-w-[200px]" title={job.fileName}>
                          {job.fileName}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{job.serviceName}</td>
                        <td className="py-3 px-4 text-slate-600">{job.pageCount}</td>
                        <td className="py-3 px-4">
                          {job.status === 'completed' && <Badge variant="success">Completed</Badge>}
                          {job.status === 'processing' && <Badge variant="info">Processing</Badge>}
                          {job.status === 'queued' && <Badge variant="warning">Queued</Badge>}
                          {job.status === 'failed' && <Badge variant="danger">Failed</Badge>}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                          {job.createdAt ? formatDateTime(job.createdAt) : job.submissionTime || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
