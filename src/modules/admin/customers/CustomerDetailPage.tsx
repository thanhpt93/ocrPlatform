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

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, toggleCustomerStatus } = usePlatformStore();

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fallbackCustomer = customers.find((c) => c.id === id);

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
        Loading real customer record from backend...
      </div>
    );
  }

  if (error && !detail && !fallbackCustomer) {
    return (
      <div className="space-y-4">
        <Button onClick={() => navigate('/admin/customers')} variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Customers
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
  const phone = custSummary?.profile?.phone || fallbackCustomer?.phone || 'Not provided';
  const taxId = custSummary?.profile?.tax_id || fallbackCustomer?.taxId || 'Not provided';
  const address = custSummary?.profile?.address || fallbackCustomer?.address || 'Not provided';
  const totalSpend = custSummary?.total_spend ?? fallbackCustomer?.totalSpend ?? 0;
  const monthlySpend = custSummary?.monthly_spend ?? fallbackCustomer?.monthlySpend ?? 0;
  const totalUsage = custSummary?.total_usage ?? fallbackCustomer?.totalUsagePages ?? 0;

  const customerSubs = detail?.subscriptions || [];
  const customerLicenses = detail?.licenses || [];
  const customerUsage = detail?.usage_records || [];
  const customerOrders = detail?.orders || [];
  const customerAudits = detail?.audit_logs || [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'subscriptions', label: 'Subscriptions', count: customerSubs.length },
    { id: 'licenses', label: 'Licenses', count: customerLicenses.length },
    { id: 'usage', label: 'OCR Usage', count: customerUsage.length },
    { id: 'orders', label: 'Orders', count: customerOrders.length },
    { id: 'audit', label: 'Audit History', count: customerAudits.length },
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
            { label: 'Admin Portal', path: '/admin/dashboard' },
            { label: 'Customers', path: '/admin/customers' },
            { label: fullName },
          ]}
        />
        <div className="flex items-center gap-3 mt-2">
          <Button onClick={() => navigate('/admin/customers')} variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Customers
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
                  {tier} Tier
                </Badge>
                {status === 'active' ? (
                  <Badge variant="success" size="sm">Active</Badge>
                ) : (
                  <Badge variant="danger" size="sm">Suspended</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1.5">
                <span className="font-mono text-amber-600">{id}</span>
                <span>•</span>
                <span>{email}</span>
                <span>•</span>
                <span>Registered {formatDate(regDate)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleToggle}
              variant={status === 'active' ? 'danger' : 'success'}
              size="sm"
            >
              {status === 'active' ? 'Suspend Account' : 'Activate Account'}
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
              Registered Account Profile
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Full Name:</span>
                <span className="font-semibold text-slate-800">{fullName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Organization / Company:</span>
                <span className="font-semibold text-slate-800">{custSummary?.profile?.company_name || 'Not provided'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Email:</span>
                <span className="font-semibold text-slate-800">{email}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Contact Phone:</span>
                <span className="font-semibold text-slate-800">{phone}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Tax ID / VAT:</span>
                <span className="font-semibold text-slate-800">{taxId}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Address:</span>
                <span className="font-semibold text-slate-800">{address}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              Real Commercial Metrics
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Collected Spend:</span>
                <span className="font-bold text-amber-600">{formatCurrency(totalSpend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last 30 Days Spend:</span>
                <span className="font-semibold text-slate-800">{formatCurrency(monthlySpend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lifetime Usage Units:</span>
                <span className="font-semibold text-slate-800">{formatNumber(totalUsage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Licenses:</span>
                <span className="font-semibold text-slate-800">{customerLicenses.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Subscriptions:</span>
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
                    <th className="py-3 px-4">Subscription ID</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Package</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4">Quota Used</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerSubs.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-slate-400">No subscriptions yet.</td></tr>
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
                        <Badge variant={s.status === 'active' ? 'success' : 'warning'} size="sm">{s.status}</Badge>
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
                    <th className="py-3 px-4">License ID</th>
                    <th className="py-3 px-4">Masked Key</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Quota Usage</th>
                    <th className="py-3 px-4">Expiration Date</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerLicenses.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">No licenses issued yet.</td></tr>
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
                        <Badge variant={lic.status === 'active' ? 'success' : 'danger'} size="sm">{lic.status}</Badge>
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
                    <th className="py-3 px-4">Job ID</th>
                    <th className="py-3 px-4">License</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Units</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerUsage.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">No OCR runs recorded for this account yet.</td></tr>
                  ) : customerUsage.map((rec: any) => (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-blue-600">{rec.job_id || rec.id}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{rec.masked_key || rec.license_id}</td>
                      <td className="py-3 px-4 text-slate-800">{rec.service_name || rec.service_id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{rec.amount} {rec.quota_type}</td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{new Date(rec.created_at).toLocaleString()}</td>
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
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Package</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerOrders.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">No orders placed yet.</td></tr>
                  ) : customerOrders.map((o: any) => (
                    <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-amber-600">{o.order_number}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(o.created_at)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{o.package_name || 'Package'}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(o.amount)}</td>
                      <td className="py-3 px-4">
                        <Badge variant={o.status === 'completed' ? 'success' : o.status === 'failed' ? 'danger' : 'warning'} size="sm">
                          {o.status}
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
          <h3 className="font-bold text-sm text-slate-900">Real Security & Provisioning Audit Log</h3>
          <div className="space-y-2 text-xs">
            {customerAudits.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-slate-400 text-center">
                No audit events recorded for this account yet.
              </div>
            ) : customerAudits.map((log: any) => (
              <div key={log.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span className="font-semibold text-slate-700">{log.action}</span>
                  <span>{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <p className="text-slate-600 mt-0.5">{log.details || `${log.resource_type}:${log.resource_id}`}</p>
                <span className="text-[10px] text-slate-400">Actor: {log.actor_email}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
