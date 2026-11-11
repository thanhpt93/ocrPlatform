import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  FileCheck2,
  Gauge,
  KeyRound,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { StatCard } from '@/components/common/StatCard';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, formatDate } from '@/utils/formatters';

export const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { customers, activeCustomerId, subscriptions, licenses, jobs, dailyStats, services, currentUser, syncWithBackend } = usePlatformStore();

  useEffect(() => {
    syncWithBackend();
  }, []);

  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const customer = customers.find((c) => c.id === effectiveCustomerId) || {
    id: effectiveCustomerId,
    orgName: currentUser?.company_name || currentUser?.full_name || currentUser?.email || 'My Organization',
    email: currentUser?.email || '',
    phone: '',
    address: '',
    taxId: '',
    registrationDate: new Date().toISOString().split('T')[0],
    tier: 'Standard',
    status: 'active',
    memberCount: 1,
    members: [],
    activeSubscriptionsCount: 0,
    activeLicensesCount: 0,
    totalUsagePages: 0,
    monthlySpend: 0,
  };

  // Customer specific data
  const customerSubs = subscriptions.filter((s) => s.customerId === effectiveCustomerId);
  const customerLicenses = licenses.filter((l) => l.customerId === effectiveCustomerId);
  const customerJobs = jobs.filter((j) => j.customerId === effectiveCustomerId);

  // Aggregated KPIs
  const activeSubsCount = customerSubs.filter((s) => s.status === 'active').length;
  const activeLicensesCount = customerLicenses.filter((l) => l.status === 'active').length;
  const totalQuota = customerSubs.reduce((acc, curr) => acc + curr.totalQuota, 0);
  const usedQuota = customerSubs.reduce((acc, curr) => acc + curr.usedQuota, 0);
  const remainingQuota = Math.max(0, totalQuota - usedQuota);
  const quotaPercent = totalQuota > 0 ? Math.min(100, Math.round((usedQuota / totalQuota) * 100)) : 0;

  // Chart data: Recent 14 days
  const recentStats = dailyStats.length > 0
    ? dailyStats.slice(-14).map((d) => ({
        date: d.date.slice(5),
        pages: activeSubsCount > 0 ? Math.floor(d.pages * 0.2) : 0,
        jobs: activeSubsCount > 0 ? Math.floor(d.jobs * 0.2) : 0,
      }))
    : [];

  // Service distribution for customer
  const serviceDistribution = activeSubsCount > 0
    ? [
        { name: 'Smart Invoice OCR', value: 42, color: '#2563eb' },
        { name: 'Identity & eKYC', value: 28, color: '#3b82f6' },
        { name: 'Complex Table OCR', value: 18, color: '#60a5fa' },
        { name: 'General PDF OCR', value: 12, color: '#93c5fd' },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'Dashboard' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">
            Welcome back, {customer.orgName}
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

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active OCR Services"
          value={activeSubsCount}
          subtitle={activeSubsCount > 0 ? 'Active Subscriptions' : 'No active subscription'}
          icon={<Layers className="h-5 w-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Pages Processed"
          value={formatNumber(usedQuota)}
          subtitle={activeSubsCount > 0 ? 'Quota consumed' : 'No usage recorded'}
          icon={<FileCheck2 className="h-5 w-5" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title="Remaining Quota"
          value={`${formatNumber(remainingQuota)} pgs`}
          subtitle={totalQuota > 0 ? `${quotaPercent}% consumed of ${formatNumber(totalQuota)}` : 'Quota not provisioned'}
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
      {activeSubsCount === 0 && (
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white p-6 shadow-xs">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  Chào mừng bạn đến với ocrPlatform! Tài khoản mới đã sẵn sàng.
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                  Tài khoản của bạn hiện ở trạng thái sạch, chưa có gói dịch vụ nào. Hãy vào <strong>OCR Marketplace</strong> để chọn gói dịch vụ (Page, Document hoặc Credit), thực hiện quy trình Đặt hàng & Thanh toán mô phỏng để hệ thống tự động cấp phát <strong>Gói đăng ký (Subscription)</strong>, <strong>Giấy phép (License)</strong> và <strong>API Key</strong>.
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate('/app/marketplace')}
              variant="primary"
              size="md"
              className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Khám phá OCR Marketplace
            </Button>
          </div>
        </Card>
      )}

      {/* Charts Section */}
      {activeSubsCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Usage Trend Area Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>OCR Processing Volume Trend</CardTitle>
                <CardDescription>Daily processed pages over the last 14 days</CardDescription>
              </div>
              <Badge variant="default" size="sm">
                <TrendingUp className="h-3 w-3 mr-1" /> Real-time
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full pt-2">
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
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                      itemStyle={{ color: '#93c5fd' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pages"
                      name="Pages Processed"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#customerPagesGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Breakdown by Service */}
          <Card>
            <CardHeader>
              <CardTitle>Usage by OCR Service</CardTitle>
              <CardDescription>Share of quota consumption</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={serviceDistribution}
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {serviceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full mt-2 space-y-1.5">
                {serviceDistribution.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="truncate max-w-[150px]">{s.name}</span>
                    </div>
                    <span className="font-semibold text-slate-800">{s.value}%</span>
                  </div>
                ))}
              </div>
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
              {activeSubsCount === 0 ? (
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                  <ShieldCheck className="h-5 w-5 text-emerald-500 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">Tài khoản bình thường</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Không có cảnh báo hạn mức hoặc hết hạn nào cho tài khoản này.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-white rounded-lg border border-amber-200/70 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-800">Active Service Status</span>
                    <Badge variant="success" size="sm">Healthy</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2">
                    {remainingQuota} / {totalQuota} units remaining.
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
              <CardDescription>Latest files processed across all subscribed services</CardDescription>
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
                    <th className="py-2.5 px-4">Pages</th>
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
                        <td className="py-3 px-4 text-slate-600">{job.pageCount} pgs</td>
                        <td className="py-3 px-4">
                          {job.status === 'completed' && <Badge variant="success">Completed</Badge>}
                          {job.status === 'processing' && <Badge variant="info">Processing</Badge>}
                          {job.status === 'queued' && <Badge variant="warning">Queued</Badge>}
                          {job.status === 'failed' && <Badge variant="danger">Failed</Badge>}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                          {job.submissionTime.split(' ')[1]}
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
