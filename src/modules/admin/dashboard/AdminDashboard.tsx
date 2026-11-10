import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Layers,
  CreditCard,
  KeyRound,
  FileText,
  DollarSign,
  TrendingUp,
  Activity,
  Server,
  ArrowUpRight,
  ShieldCheck,
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
  LineChart,
  Line,
} from 'recharts';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { StatCard } from '@/components/common/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, formatCurrency } from '@/utils/formatters';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { customers, services, subscriptions, licenses, jobs, orders, dailyStats, workers } = usePlatformStore();

  const totalCustomers = customers.length;
  const activeServices = services.filter((s) => s.status === 'published').length;
  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;
  const activeLicenses = licenses.filter((l) => l.status === 'active').length;
  const totalPagesProcessed = jobs.reduce((acc, curr) => acc + curr.pageCount, 0) + 195400;
  const totalRevenue = orders.reduce((acc, curr) => acc + curr.amount, 0) + 24800;

  // Monthly Revenue Chart Data
  const monthlyRevenueData = [
    { month: 'Jun', revenue: 14200, volume: 82000 },
    { month: 'Jul', revenue: 16800, volume: 95000 },
    { month: 'Aug', revenue: 19500, volume: 112000 },
    { month: 'Sep', revenue: 22400, volume: 135000 },
    { month: 'Oct', revenue: 25900, volume: 160000 },
    { month: 'Nov', revenue: 28400, volume: 195000 },
  ];

  // Service Popularity Distribution
  const servicePopularity = [
    { name: 'Smart Invoice OCR', value: 38, color: '#f59e0b' },
    { name: 'Identity & eKYC OCR', value: 26, color: '#3b82f6' },
    { name: 'Complex Table OCR', value: 18, color: '#10b981' },
    { name: 'General PDF OCR', value: 12, color: '#8b5cf6' },
    { name: 'Legal Contract OCR', value: 6, color: '#ec4899' },
  ];

  // Customer Growth
  const customerGrowth = [
    { month: 'Jun', total: 24, newCust: 4 },
    { month: 'Jul', total: 31, newCust: 7 },
    { month: 'Aug', total: 42, newCust: 11 },
    { month: 'Sep', total: 56, newCust: 14 },
    { month: 'Oct', total: 72, newCust: 16 },
    { month: 'Nov', total: 89, newCust: 17 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'Platform Dashboard' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Platform Control Center</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-tenant SaaS KPIs, global inference volume, service metrics, and revenue analytics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate('/admin/monitoring')} variant="outline" size="sm">
            <Activity className="h-4 w-4 mr-1 text-amber-600" />
            Inference Telemetry
          </Button>
          <Button onClick={() => navigate('/admin/services')} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
            Manage OCR Catalog
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid (6 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Customers"
          value={totalCustomers}
          change="+18%"
          isPositive={true}
          subtitle="Enterprise orgs"
          icon={<Users className="h-5 w-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Active Services"
          value={activeServices}
          subtitle="In production"
          icon={<Layers className="h-5 w-5" />}
          iconBgColor="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Subscriptions"
          value={activeSubs}
          change="+8%"
          isPositive={true}
          subtitle="Recurring plans"
          icon={<CreditCard className="h-5 w-5" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title="Active Licenses"
          value={activeLicenses}
          subtitle="Verified bindings"
          icon={<KeyRound className="h-5 w-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Pages Processed"
          value={formatNumber(totalPagesProcessed)}
          change="+24%"
          isPositive={true}
          subtitle="Total platform"
          icon={<FileText className="h-5 w-5" />}
          iconBgColor="bg-purple-50 text-purple-600"
        />
        <StatCard
          title="Gross Revenue"
          value={formatCurrency(totalRevenue)}
          change="+16.5%"
          isPositive={true}
          subtitle="YTD collected"
          icon={<DollarSign className="h-5 w-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Charts Section: Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Revenue Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Monthly Platform Revenue ($)</CardTitle>
              <CardDescription>SaaS recurring subscriptions and prepaid quota purchases</CardDescription>
            </div>
            <Badge variant="success" size="sm">
              <TrendingUp className="h-3 w-3 mr-1" /> +16.5% MoM
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevenueData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: any) => formatCurrency(Number(val))}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="revenue" name="Revenue ($)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Service Popularity Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Service Popularity</CardTitle>
            <CardDescription>Share of tenant subscription volume</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={servicePopularity} innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {servicePopularity.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full mt-2 space-y-1.5 text-xs">
              {servicePopularity.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-600 truncate max-w-[140px]">{s.name}</span>
                  </div>
                  <span className="font-semibold text-slate-800">{s.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section: Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OCR Processing Volume 30-Day Trend */}
        <Card>
          <CardHeader>
            <CardTitle>OCR Processing Volume (30 Days)</CardTitle>
            <CardDescription>Pages processed across all multi-tenant workers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyStats} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminVolumeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="pages" name="Pages" stroke="#3b82f6" strokeWidth={2} fill="url(#adminVolumeGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Customer Growth Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Growth & Onboarding</CardTitle>
            <CardDescription>Cumulative enterprise client organizations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={customerGrowth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Line type="monotone" dataKey="total" name="Total Orgs" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="newCust" name="New Onboarded" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
