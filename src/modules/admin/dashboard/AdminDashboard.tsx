import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Layers,
  CreditCard,
  KeyRound,
  FileText,
  DollarSign,
  Activity,
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
import { useTranslation } from '@/i18n';

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];

export const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    adminDashboard,
    customers,
    services,
    subscriptions,
    licenses,
    orders,
    dailyStats,
  } = usePlatformStore();

  const totalCustomers = adminDashboard?.total_customers ?? customers.length;
  const activeServices =
    adminDashboard?.active_services ?? services.filter((s) => s.status === 'published').length;
  const totalServices = adminDashboard?.total_services ?? services.length;
  const activeSubs =
    adminDashboard?.active_subscriptions ?? subscriptions.filter((s) => s.status === 'active').length;
  const activeLicenses =
    adminDashboard?.active_licenses ?? licenses.filter((l) => l.status === 'active').length;
  const totalUsageUnits = adminDashboard?.total_usage_units ?? 0;
  const totalOcrJobs = adminDashboard?.total_ocr_jobs ?? 0;
  const totalRevenue =
    adminDashboard?.total_revenue ??
    orders.filter((o) => o.status === 'completed').reduce((acc, curr) => acc + curr.amount, 0);

  const monthlyRevenueData = adminDashboard?.monthly_revenue || [];
  const servicePopularity = (adminDashboard?.service_popularity || []).map((item, idx) => ({
    ...item,
    color: PIE_COLORS[idx % PIE_COLORS.length],
  }));
  const customerGrowth = adminDashboard?.customer_growth || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: t('common.adminPortal'), path: '/admin/dashboard' },
              { label: t('adminDashboard.breadcrumbCurrent') },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">
            {t('adminDashboard.title')}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('adminDashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate('/admin/monitoring')} variant="outline" size="sm">
            <Activity className="h-4 w-4 mr-1 text-amber-600" />
            {t('adminDashboard.inferenceTelemetry')}
          </Button>
          <Button onClick={() => navigate('/admin/services')} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
            {t('adminDashboard.manageCatalog')}
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid (6 Cards - 100% real database counts) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title={t('adminDashboard.kpi.registeredCustomers')}
          value={totalCustomers}
          subtitle={t('adminDashboard.kpi.realAccounts')}
          icon={<Users className="h-5 w-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          title={t('adminDashboard.kpi.publishedServices')}
          value={`${activeServices} / ${totalServices}`}
          subtitle={t('adminDashboard.kpi.activeCatalog')}
          icon={<Layers className="h-5 w-5" />}
          iconBgColor="bg-amber-50 text-amber-600"
        />
        <StatCard
          title={t('adminDashboard.kpi.activeSubscriptions')}
          value={activeSubs}
          subtitle={t('adminDashboard.kpi.livePlans')}
          icon={<CreditCard className="h-5 w-5" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title={t('adminDashboard.kpi.activeLicenses')}
          value={activeLicenses}
          subtitle={t('adminDashboard.kpi.provisionedKeys')}
          icon={<KeyRound className="h-5 w-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title={t('adminDashboard.kpi.unitsProcessed')}
          value={formatNumber(totalUsageUnits)}
          subtitle={t('adminDashboard.kpi.recordedRuns', { count: formatNumber(totalOcrJobs) })}
          icon={<FileText className="h-5 w-5" />}
          iconBgColor="bg-purple-50 text-purple-600"
        />
        <StatCard
          title={t('adminDashboard.kpi.collectedRevenue')}
          value={formatCurrency(totalRevenue)}
          subtitle={t('adminDashboard.kpi.completedOrders')}
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
              <CardTitle>{t('adminDashboard.monthlyRevenueTitle')}</CardTitle>
              <CardDescription>{t('adminDashboard.monthlyRevenueDesc')}</CardDescription>
            </div>
            <Badge variant="default" size="sm">
              {t('adminDashboard.totalBadge', { amount: formatCurrency(totalRevenue) })}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full pt-2">
              {monthlyRevenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyRevenueData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(val: any) => formatCurrency(Number(val))}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="revenue" name={t('adminDashboard.revenueSeries')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  {t('adminDashboard.noRevenueYet')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Service Popularity Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminDashboard.serviceUtilTitle')}</CardTitle>
            <CardDescription>{t('adminDashboard.serviceUtilDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            {servicePopularity.length > 0 ? (
              <>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={servicePopularity} innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="percentage" nameKey="name">
                        {servicePopularity.map((entry, index) => (
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
                <div className="w-full mt-2 space-y-1.5 text-xs">
                  {servicePopularity.map((s) => (
                    <div key={s.service_id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-slate-600 truncate">{s.name}</span>
                      </div>
                      <span className="font-semibold text-slate-800 shrink-0">
                        {t('adminDashboard.serviceShareSummary', {
                          pct: s.percentage,
                          units: s.usage_units,
                          subs: s.subscriptions,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-52 flex items-center justify-center text-xs text-slate-400 text-center">
                {t('adminDashboard.noServiceUtilYet')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Section: Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OCR Processing Volume 30-Day Trend */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminDashboard.volume30dTitle')}</CardTitle>
            <CardDescription>{t('adminDashboard.volume30dDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full pt-2">
              {dailyStats.length > 0 ? (
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
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pages"
                      name={t('adminDashboard.unitsProcessedName')}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#adminVolumeGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  {t('adminDashboard.noUsageHistoryYet')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Customer Growth Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminDashboard.customerGrowthTitle')}</CardTitle>
            <CardDescription>{t('adminDashboard.customerGrowthDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full pt-2">
              {customerGrowth.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={customerGrowth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name={t('adminDashboard.totalCustomersSeries')}
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="new_customers"
                      name={t('adminDashboard.newRegistrationsSeries')}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  {t('adminDashboard.noCustomersYet')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
