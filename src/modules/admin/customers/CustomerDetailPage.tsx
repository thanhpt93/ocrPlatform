import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { adminApi } from '@/services/api/endpoints';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, formatDate, formatCurrency } from '@/utils/formatters';
import { useTranslation } from '@/i18n';

export const CustomerDetailPage: React.FC = () => {
  const { t, dict, intlLocale } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, toggleCustomerStatus } = usePlatformStore();

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fallbackCustomer = customers.find((c) => c.id === id);
  const statusesMap = dict.common.statuses as Record<string, string>;

  useEffect(() => {
    let cancelled = false;
    const loadDetail = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.getCustomerDetail(id);
        if (!cancelled) {
          setDetail(res);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load customer details');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [id, customers]);

  if (loading && !detail && !fallbackCustomer) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        {t('adminCustomers.loadingDetail')}
      </div>
    );
  }

  if (error && !detail && !fallbackCustomer) {
    return (
      <div className="space-y-4">
        <Button onClick={() => navigate('/admin/customers')} variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> {t('adminCustomers.backToCustomers')}
        </Button>
        <Card className="p-6 text-center text-xs text-rose-600">{error}</Card>
      </div>
    );
  }

  const custSummary = detail?.customer;
  const displayName =
    custSummary?.profile?.company_name ||
    custSummary?.full_name ||
    fallbackCustomer?.orgName ||
    custSummary?.email ||
    'Customer';
  const email = custSummary?.email || fallbackCustomer?.email || '';
  const fullName = custSummary?.full_name || fallbackCustomer?.fullName || displayName;
  const tier = custSummary?.tier || fallbackCustomer?.tier || 'Standard';
  const status = (custSummary?.status || fallbackCustomer?.status || 'ACTIVE').toLowerCase();
  const regDate = custSummary?.created_at
    ? custSummary.created_at.split('T')[0]
    : fallbackCustomer?.registrationDate || '';
  const notProvided = t('common.notProvided');
  const phone = custSummary?.profile?.phone || fallbackCustomer?.phone || notProvided;
  const taxId = custSummary?.profile?.tax_id || fallbackCustomer?.taxId || notProvided;
  const address = custSummary?.profile?.address || fallbackCustomer?.address || notProvided;
  const totalSpend = custSummary?.total_spend ?? fallbackCustomer?.totalSpend ?? 0;
  const monthlySpend = custSummary?.monthly_spend ?? fallbackCustomer?.monthlySpend ?? 0;
  const totalUsage = custSummary?.total_usage ?? fallbackCustomer?.totalUsagePages ?? 0;

  const customerSubs = detail?.subscriptions || [];
  const customerLicenses = detail?.licenses || [];
  const customerUsage = detail?.usage_records || [];
  const customerOrders = detail?.orders || [];
  const customerAudits = detail?.audit_logs || [];

  const tabs = [
    { id: 'overview', label: t('adminCustomers.tabOverview') },
    { id: 'subscriptions', label: t('adminCustomers.tabSubs'), count: customerSubs.length },
    { id: 'licenses', label: t('adminCustomers.tabLics'), count: customerLicenses.length },
    { id: 'usage', label: t('adminCustomers.tabUsage'), count: customerUsage.length },
    { id: 'orders', label: t('adminCustomers.tabOrders'), count: customerOrders.length },
    { id: 'audit', label: t('adminCustomers.tabAudit'), count: customerAudits.length },
  ];

  const handleToggle = async () => {
    if (!id) return;
    await toggleCustomerStatus(id);
    const refreshed = await adminApi.getCustomerDetail(id);
    setDetail(refreshed);
  };

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumbs */}
      <div>
        <Breadcrumbs
          items={[
            { label: t('common.adminPortal'), path: '/admin/dashboard' },
            { label: t('adminCustomers.detailBreadcrumbList'), path: '/admin/customers' },
            { label: fullName },
          ]}
        />
        <div className="flex items-center gap-3 mt-2">
          <Button onClick={() => navigate('/admin/customers')} variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('adminCustomers.backToCustomers')}
          </Button>
        </div>
      </div>

      {/* Hero Header Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 font-bold text-lg">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">{fullName}</h1>
                <Badge
                  variant={
                    tier === 'Enterprise'
                      ? 'purple'
                      : tier === 'Professional' || tier === 'Premium'
                      ? 'default'
                      : 'slate'
                  }
                  size="sm"
                >
                  {t('adminCustomers.tierSuffix', { tier })}
                </Badge>
                {status === 'active' ? (
                  <Badge variant="success" size="sm">{t('common.statuses.active')}</Badge>
                ) : (
                  <Badge variant="danger" size="sm">{t('common.statuses.suspended')}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1.5">
                <span className="font-mono text-amber-600">{id}</span>
                <span>•</span>
                <span>{email}</span>
                <span>•</span>
                <span>{t('adminCustomers.registeredOn', { date: formatDate(regDate) })}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleToggle}
              variant={status === 'active' ? 'danger' : 'success'}
              size="sm"
            >
              {status === 'active' ? t('adminCustomers.suspendAccount') : t('adminCustomers.activateAccount')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 space-y-4 p-5">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              {t('adminCustomers.profileTitle')}
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">{t('adminCustomers.fullNameLabel')}</span>
                <span className="font-semibold text-slate-800">{fullName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('adminCustomers.orgLabel')}</span>
                <span className="font-semibold text-slate-800">{custSummary?.profile?.company_name || notProvided}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('adminCustomers.emailLabel')}</span>
                <span className="font-semibold text-slate-800">{email}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('adminCustomers.phoneLabel')}</span>
                <span className="font-semibold text-slate-800">{phone}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('adminCustomers.taxIdLabel')}</span>
                <span className="font-semibold text-slate-800">{taxId}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('adminCustomers.addressLabel')}</span>
                <span className="font-semibold text-slate-800">{address}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              {t('adminCustomers.metricsTitle')}
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminCustomers.totalCollectedSpend')}</span>
                <span className="font-bold text-amber-600">{formatCurrency(totalSpend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminCustomers.last30dSpend')}</span>
                <span className="font-semibold text-slate-800">{formatCurrency(monthlySpend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminCustomers.lifetimeUnits')}</span>
                <span className="font-semibold text-slate-800">{formatNumber(totalUsage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminCustomers.licensesLabel')}</span>
                <span className="font-semibold text-slate-800">{customerLicenses.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminCustomers.subsLabel')}</span>
                <span className="font-semibold text-slate-800">{customerSubs.length}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Subscriptions */}
      {activeTab === 'subscriptions' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('subscriptions.colId')}</th>
                    <th className="py-3 px-4">{t('subscriptions.colService')}</th>
                    <th className="py-3 px-4">{t('subscriptions.colPackage')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colPrice')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colQuotaUsed')}</th>
                    <th className="py-3 px-4">{t('adminLicenses.colExpiry')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerSubs.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-slate-400">{t('adminCustomers.noSubsYet')}</td></tr>
                  ) : customerSubs.map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-amber-600">{s.id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{s.service_name}</td>
                      <td className="py-3 px-4 text-slate-600">{s.package_name} (v{s.version_number})</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(s.price)}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {formatNumber(s.used_quota)} / {formatNumber(s.total_quota)}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(s.end_date)}</td>
                      <td className="py-3 px-4">
                        <Badge variant={s.status === 'active' ? 'success' : 'warning'} size="sm">
                          {statusesMap[s.status] || s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Licenses */}
      {activeTab === 'licenses' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('adminLicenses.colId')}</th>
                    <th className="py-3 px-4">{t('licenses.colMaskedKey')}</th>
                    <th className="py-3 px-4">{t('adminLicenses.colService')}</th>
                    <th className="py-3 px-4">{t('adminLicenses.colQuota')}</th>
                    <th className="py-3 px-4">{t('adminLicenses.colExpiry')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerLicenses.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t('adminCustomers.noLicsYet')}</td></tr>
                  ) : customerLicenses.map((lic: any) => (
                    <tr key={lic.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{lic.id}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{lic.masked_key}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{lic.service_name}</td>
                      <td className="py-3 px-4 text-blue-600 font-mono">
                        {formatNumber(lic.used_quota)} / {formatNumber(lic.quota)}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(lic.expires_at)}</td>
                      <td className="py-3 px-4">
                        <Badge variant={lic.status === 'active' ? 'success' : 'danger'} size="sm">
                          {statusesMap[lic.status] || lic.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: OCR Usage */}
      {activeTab === 'usage' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('adminMonitoring.colJobId')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colLicenseKey')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colService')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colUnits')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colExecutedAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerUsage.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">{t('adminCustomers.noUsageYet')}</td></tr>
                  ) : customerUsage.map((rec: any) => (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-blue-600">{rec.job_id || rec.id}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{rec.masked_key || rec.license_id}</td>
                      <td className="py-3 px-4 text-slate-800">{rec.service_name || rec.service_id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{rec.amount} {rec.quota_type}</td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{new Date(rec.created_at).toLocaleString(intlLocale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Orders */}
      {activeTab === 'orders' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('adminBilling.colOrderNum')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colDate')}</th>
                    <th className="py-3 px-4">{t('subscriptions.colPackage')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colAmount')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerOrders.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">{t('adminCustomers.noOrdersYet')}</td></tr>
                  ) : customerOrders.map((o: any) => (
                    <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-amber-600">{o.order_number}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(o.created_at)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{o.package_name || t('subscriptions.colPackage')}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(o.amount)}</td>
                      <td className="py-3 px-4">
                        <Badge variant={o.status === 'completed' ? 'success' : o.status === 'failed' ? 'danger' : 'warning'} size="sm">
                          {statusesMap[o.status] || o.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 6: Audit History */}
      {activeTab === 'audit' && (
        <Card className="p-4 space-y-3">
          <h3 className="font-bold text-sm text-slate-900">{t('adminCustomers.auditLogTitle')}</h3>
          <div className="space-y-2 text-xs">
            {customerAudits.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-slate-400 text-center">
                {t('adminCustomers.noAuditYet')}
              </div>
            ) : customerAudits.map((log: any) => (
              <div key={log.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span className="font-semibold text-slate-700">{log.action}</span>
                  <span>{new Date(log.created_at).toLocaleString(intlLocale)}</span>
                </div>
                <p className="text-slate-600 mt-0.5">{log.details || `${log.resource_type}:${log.resource_id}`}</p>
                <span className="text-[10px] text-slate-400">{t('common.actor')}: {log.actor_email}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
