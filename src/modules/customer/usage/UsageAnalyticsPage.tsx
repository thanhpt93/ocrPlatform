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
  const { customers, activeCustomerId, dailyStats, services, subscriptions, licenses } = usePlatformStore();
  const customer = customers.find((c) => c.id === activeCustomerId) || customers[0];

  const [dateRange, setDateRange] = useState<'7' | '14' | '30'>('30');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedLicense, setSelectedLicense] = useState<string>('all');

  const customerSubs = subscriptions.filter((s) => s.customerId === customer.id);
  const customerLicenses = licenses.filter((l) => l.customerId === customer.id);

  const totalQuota = customerSubs.reduce((a, b) => a + b.totalQuota, 0) || 50000;
  const totalUsed = customerSubs.reduce((a, b) => a + b.usedQuota, 0) || 32400;
  const remaining = Math.max(0, totalQuota - totalUsed);
  const usagePercent = Math.min(100, Math.round((totalUsed / totalQuota) * 100));

  // Filtered stats by date range
  const daysCount = parseInt(dateRange, 10);
  const filteredStats = dailyStats.slice(-daysCount).map((d) => {
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
  });

  const serviceBreakdown = [
    { name: 'Smart Invoice OCR', pages: 38240, color: '#2563eb' },
    { name: 'Identity & eKYC OCR', pages: 4120, color: '#3b82f6' },
    { name: 'Complex Table OCR', pages: 2450, color: '#60a5fa' },
    { name: 'General PDF OCR', pages: 1200, color: '#93c5fd' },
  ];

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
          <Button variant="outline" size="sm" onClick={() => alert('Exporting 30-day analytics CSV...')}>
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
          change="+14.2%"
          isPositive={true}
          subtitle="Processed this period"
          icon={<FileCheck className="h-5 w-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Remaining Quota"
          value={`${formatNumber(remaining)} pages`}
          subtitle="From active subscriptions"
          icon={<Zap className="h-5 w-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Usage Ratio"
          value={`${usagePercent}%`}
          subtitle={`${formatNumber(totalUsed)} / ${formatNumber(totalQuota)}`}
          icon={<BarChart3 className="h-5 w-5" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title="Avg Latency"
          value="1.84s"
          change="-0.2s"
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
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#usageAnalyticsGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Breakdown by Service */}
        <Card>
          <CardHeader>
            <CardTitle>Service Quota Allocation</CardTitle>
            <CardDescription>Proportional pages consumed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={serviceBreakdown} innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="pages">
                    {serviceBreakdown.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1.5">
              {serviceBreakdown.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-600 truncate max-w-[140px]">{s.name}</span>
                  </div>
                  <span className="font-semibold text-slate-800">{formatNumber(s.pages)} pgs</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed History Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Daily Telemetry Log</CardTitle>
            <CardDescription>Tabular audit of processed pages and success rates</CardDescription>
          </div>
          <Badge variant="slate" size="sm">
            {filteredStats.length} Days Recorded
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Pages Processed</th>
                  <th className="py-2.5 px-4">Jobs Executed</th>
                  <th className="py-2.5 px-4">Failed Jobs</th>
                  <th className="py-2.5 px-4">Avg Processing Time</th>
                  <th className="py-2.5 px-4 text-right">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStats.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-800">{row.fullDate}</td>
                    <td className="py-3 px-4 font-semibold text-blue-600">{formatNumber(row.pages)}</td>
                    <td className="py-3 px-4 text-slate-700">{formatNumber(row.jobs)}</td>
                    <td className="py-3 px-4">
                      {row.failed > 0 ? (
                        <span className="text-rose-600 font-semibold">{row.failed}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{(row.avgDurationMs / 1000).toFixed(2)}s</td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-emerald-600">{row.successRate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
