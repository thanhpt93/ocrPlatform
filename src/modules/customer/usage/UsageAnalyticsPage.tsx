import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  FileCheck,
  Zap,
  Clock,
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
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { StatCard } from '@/components/common/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/utils/formatters';

const PIE_COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];

export const UsageAnalyticsPage: React.FC = () => {
  const {
    activeCustomerId,
    dailyStats,
    customerUsageSummary,
    services,
    subscriptions,
    licenses,
    currentUser,
    syncWithBackend,
  } = usePlatformStore();

  useEffect(() => {
    syncWithBackend();
  }, [syncWithBackend]);

  const isAuthenticated = Boolean(api.getAccessToken());
  const effectiveCustomerId = isAuthenticated ? (currentUser?.id || activeCustomerId) : '';

  const [dateRange, setDateRange] = useState<'7' | '14' | '30'>('30');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedLicense, setSelectedLicense] = useState<string>('all');

  const customerSubs = useMemo(
    () => (effectiveCustomerId ? subscriptions.filter((s) => s.customerId === effectiveCustomerId) : []),
    [subscriptions, effectiveCustomerId]
  );
  const customerLicenses = useMemo(
    () => (effectiveCustomerId ? licenses.filter((l) => l.customerId === effectiveCustomerId) : []),
    [licenses, effectiveCustomerId]
  );

  const totalQuota =
    customerUsageSummary?.total_quota ??
    customerLicenses.reduce((a, b) => a + (b.quota || 0), 0);
  const totalUsed =
    customerUsageSummary?.used_quota ??
    customerLicenses.reduce((a, b) => a + (b.usedQuota || 0), 0);
  const remaining =
    customerUsageSummary?.remaining_quota ??
    Math.max(0, totalQuota - totalUsed);
  const usagePercent = totalQuota > 0 ? Math.min(100, Math.round((totalUsed / totalQuota) * 100)) : 0;
  const avgLatencySec = customerUsageSummary?.avg_latency_ms
    ? `${(customerUsageSummary.avg_latency_ms / 1000).toFixed(2)}s`
    : '0.00s';

  const daysCount = parseInt(dateRange, 10);
  const filteredStats = useMemo(
    () =>
      dailyStats.slice(-daysCount).map((d) => ({
        date: d.date.slice(5),
        fullDate: d.date,
        pages: d.pages,
        jobs: d.jobs,
      })),
    [dailyStats, daysCount]
  );
  const hasUsageTrend = filteredStats.some((d) => d.pages > 0 || d.jobs > 0);

  const serviceBreakdown = useMemo(
    () =>
      (customerUsageSummary?.service_breakdown || [])
        .filter((s) => selectedService === 'all' || s.service_id === selectedService)
        .map((s, idx) => ({
          serviceId: s.service_id,
          name: s.service_name,
          pages: s.usage_units,
          percentage: s.percentage,
          color: PIE_COLORS[idx % PIE_COLORS.length],
        })),
    [customerUsageSummary, selectedService]
  );

  const handleExportCsv = () => {
    const rows = [
      ['Date', 'Units', 'Jobs'],
      ...filteredStats.map((r) => [r.fullDate, String(r.pages), String(r.jobs)]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage_analytics_${dateRange}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'Usage & Analytics' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Usage & Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time telemetry, quota consumption rates, and OCR processing performance analytics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export CSV Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Usage"
          value={`${formatNumber(totalUsed)} units`}
          subtitle={totalUsed > 0 ? 'Recorded across licenses' : 'No usage recorded'}
          icon={<FileCheck className="h-5 w-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Remaining Quota"
          value={`${formatNumber(remaining)} units`}
          subtitle={totalQuota > 0 ? 'From active licenses' : 'No active quota'}
          icon={<Zap className="h-5 w-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Usage Ratio"
          value={`${usagePercent}%`}
          subtitle={totalQuota > 0 ? `${formatNumber(totalUsed)} / ${formatNumber(totalQuota)}` : 'Quota not allocated'}
          icon={<BarChart3 className="h-5 w-5" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title="Avg Latency"
          value={avgLatencySec}
          subtitle={customerUsageSummary?.total_jobs ? `Across ${customerUsageSummary.total_jobs} job(s)` : 'No jobs processed'}
          icon={<Clock className="h-5 w-5" />}
          iconBgColor="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
            <Calendar className="h-4 w-4 text-slate-400" /> Date Range:
          </div>
          {(['7', '14', '30'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                dateRange === r ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Last {r} Days
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All OCR Services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={selectedLicense}
            onChange={(e) => setSelectedLicense(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Bound Licenses</option>
            {customerLicenses.map((l) => (
              <option key={l.id} value={l.id}>{l.maskedKey} ({l.packageName})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Charts Section */}
      {!hasUsageTrend && serviceBreakdown.length === 0 ? (
        <Card className="p-8 text-center bg-slate-50 border-slate-200">
          <BarChart3 className="h-10 w-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700">Chưa có dữ liệu thống kê sử dụng</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {customerSubs.length === 0 && customerLicenses.length === 0
              ? 'Tài khoản này chưa có lượt gọi API nào. Sau khi đăng ký gói OCR và thực hiện nhận diện văn bản, biểu đồ lưu lượng và tỷ lệ sử dụng sẽ xuất hiện tại đây.'
              : 'Tài khoản đã có gói dịch vụ nhưng chưa thực hiện lượt nhận diện OCR nào.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Volume Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Daily Processing Volume Trend</CardTitle>
              <CardDescription>Real units processed per day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="usageAnalyticsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pages"
                      name="Units"
                      stroke="#2563eb"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#usageAnalyticsGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Service Share Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Distribution</CardTitle>
              <CardDescription>Real units consumed by service</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              {serviceBreakdown.length > 0 ? (
                <>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={serviceBreakdown}
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="pages"
                          nameKey="name"
                        >
                          {serviceBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full mt-2 space-y-1">
                    {serviceBreakdown.map((s) => (
                      <div key={s.serviceId} className="flex items-center justify-between text-xs text-slate-600">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="truncate max-w-[140px]">{s.name}</span>
                        </div>
                        <span className="font-semibold text-slate-800 shrink-0">{formatNumber(s.pages)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-52 flex items-center justify-center text-xs text-slate-400 text-center">
                  No service usage recorded.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
