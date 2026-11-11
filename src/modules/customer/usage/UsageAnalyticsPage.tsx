import React, { useState } from 'react';
import {
  BarChart3,
  Calendar,
  Filter,
  Download,
  FileCheck,
  Zap,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { StatCard } from '@/components/common/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatNumber, formatDate } from '@/utils/formatters';

export const UsageAnalyticsPage: React.FC = () => {
  const { customers, activeCustomerId, dailyStats, services, subscriptions, licenses, currentUser } = usePlatformStore();
  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const customer = currentUser ? {
    id: currentUser.id,
    orgName: currentUser.company_name || currentUser.full_name || currentUser.email || 'My Organization',
  } : (customers.find((c) => c.id === effectiveCustomerId) || customers[0]);

  const [dateRange, setDateRange] = useState<'7' | '14' | '30'>('30');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedLicense, setSelectedLicense] = useState<string>('all');

  const customerSubs = subscriptions.filter((s) => s.customerId === effectiveCustomerId);
  const customerLicenses = licenses.filter((l) => l.customerId === effectiveCustomerId);

  const totalQuota = customerSubs.reduce((a, b) => a + b.totalQuota, 0);
  const totalUsed = customerSubs.reduce((a, b) => a + b.usedQuota, 0);
  const remaining = Math.max(0, totalQuota - totalUsed);
  const usagePercent = totalQuota > 0 ? Math.min(100, Math.round((totalUsed / totalQuota) * 100)) : 0;

  // Filtered stats by date range
  const daysCount = parseInt(dateRange, 10);
  const filteredStats = (customerSubs.length > 0 && dailyStats.length > 0)
    ? dailyStats.slice(-daysCount).map((d) => {
        const scale = customer.id === 'cust-1' ? 0.45 : 0.2;
        return {
          date: d.date.slice(5),
          fullDate: d.date,
          pages: Math.floor(d.pages * scale),
          jobs: Math.floor(d.jobs * scale),
          failed: Math.floor(d.failed * scale),
          avgDurationMs: d.avgDurationMs,
          successRate: Math.max(98.2, parseFloat((100 - (d.failed / d.jobs) * 100).toFixed(1))),
        };
      })
    : [];

  const serviceBreakdown = customerSubs.length > 0
    ? [
        { name: 'Smart Invoice OCR', pages: 38240, color: '#2563eb' },
        { name: 'Identity & eKYC OCR', pages: 4120, color: '#3b82f6' },
        { name: 'Complex Table OCR', pages: 2450, color: '#60a5fa' },
        { name: 'General PDF OCR', pages: 1200, color: '#93c5fd' },
      ]
    : [];

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
          <Button variant="outline" size="sm" onClick={() => alert('Exporting analytics CSV...')}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export CSV Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Usage"
          value={`${formatNumber(totalUsed)} pages`}
          change={customerSubs.length > 0 ? "+14.2%" : undefined}
          isPositive={true}
          subtitle={customerSubs.length > 0 ? "Processed this period" : "No usage recorded"}
          icon={<FileCheck className="h-5 w-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Remaining Quota"
          value={`${formatNumber(remaining)} pages`}
          subtitle={customerSubs.length > 0 ? "From active subscriptions" : "No active quota"}
          icon={<Zap className="h-5 w-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Usage Ratio"
          value={`${usagePercent}%`}
          subtitle={totalQuota > 0 ? `${formatNumber(totalUsed)} / ${formatNumber(totalQuota)}` : "Quota not allocated"}
          icon={<BarChart3 className="h-5 w-5" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title="Avg Latency"
          value={customerSubs.length > 0 ? "1.84s" : "0.0s"}
          change={customerSubs.length > 0 ? "-0.2s" : undefined}
          isPositive={true}
          subtitle="Across GPU cluster"
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
          {/* Service Filter */}
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

          {/* License Filter */}
          <select
            value={selectedLicense}
            onChange={(e) => setSelectedLicense(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Bound Licenses</option>
            {customerLicenses.map((l) => (
              <option key={l.id} value={l.id}>{l.id} ({l.packageName})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Charts Section */}
      {customerSubs.length === 0 ? (
        <Card className="p-8 text-center bg-slate-50 border-slate-200">
          <BarChart3 className="h-10 w-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700">Chưa có dữ liệu thống kê sử dụng</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Tài khoản này chưa có lượt gọi API nào. Sau khi đăng ký gói OCR và thực hiện nhận diện văn bản qua API Key, biểu đồ lưu lượng và tỷ lệ thành công sẽ xuất hiện tại đây.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Volume Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Daily Processing Volume Trend</CardTitle>
              <CardDescription>Pages and jobs processed per day</CardDescription>
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
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pages"
                      name="Pages"
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
              <CardDescription>Pages consumed by service</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={serviceBreakdown}
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="pages"
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
                {serviceBreakdown.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="truncate max-w-[140px]">{s.name}</span>
                    </div>
                    <span className="font-semibold text-slate-800">{formatNumber(s.pages)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
