import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Calendar,
  Layers,
  KeyRound,
  FileCheck2,
  CreditCard,
  ShieldAlert,
  ShieldCheck,
  Activity,
  History,
  Users,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, formatDate, formatCurrency } from '@/utils/formatters';

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, subscriptions, licenses, orders, jobs, auditLogs, toggleCustomerStatus } = usePlatformStore();

  const customer = customers.find((c) => c.id === id) || customers[0];

  const customerSubs = subscriptions.filter((s) => s.customerId === customer.id);
  const customerLicenses = licenses.filter((l) => l.customerId === customer.id);
  const customerOrders = orders.filter((o) => o.customerId === customer.id);
  const customerJobs = jobs.filter((j) => j.customerId === customer.id);
  const customerAudits = auditLogs.filter((a) => a.resourceId === customer.id || a.actor.includes(customer.orgName.split(' ')[0]));

  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'members', label: 'Members', count: customer.members?.length || 4 },
    { id: 'subscriptions', label: 'Subscriptions', count: customerSubs.length },
    { id: 'licenses', label: 'Licenses', count: customerLicenses.length },
    { id: 'usage', label: 'Usage', count: customerJobs.length },
    { id: 'orders', label: 'Orders', count: customerOrders.length },
    { id: 'audit', label: 'Audit History' },
  ];

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumbs */}
      <div>
        <Breadcrumbs
          items={[
            { label: 'Admin Portal', path: '/admin/dashboard' },
            { label: 'Customers', path: '/admin/customers' },
            { label: customer.orgName },
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
              {customer.orgName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900">{customer.orgName}</h1>
                <Badge
                  variant={
                    customer.tier === 'Enterprise'
                      ? 'purple'
                      : customer.tier === 'Premium'
                      ? 'default'
                      : 'slate'
                  }
                  size="sm"
                >
                  {customer.tier} Tier
                </Badge>
                {customer.status === 'active' ? (
                  <Badge variant="success" size="sm">Active</Badge>
                ) : (
                  <Badge variant="danger" size="sm">Suspended</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1.5">
                <span className="font-mono text-amber-600">{customer.id}</span>
                <span>•</span>
                <span>{customer.email}</span>
                <span>•</span>
                <span>Registered {formatDate(customer.registrationDate)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => toggleCustomerStatus(customer.id)}
              variant={customer.status === 'active' ? 'danger' : 'success'}
              size="sm"
            >
              {customer.status === 'active' ? 'Suspend Account' : 'Activate Account'}
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
              Corporate Account Profile
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Organization Name:</span>
                <span className="font-semibold text-slate-800">{customer.orgName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Tax ID / VAT:</span>
                <span className="font-semibold text-slate-800">{customer.taxId || 'US-928174829'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Billing Contact:</span>
                <span className="font-semibold text-slate-800">{customer.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Contact Phone:</span>
                <span className="font-semibold text-slate-800">{customer.phone}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">Headquarters:</span>
                <span className="font-semibold text-slate-800">{customer.address || '100 Wall Street, New York, NY'}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              Commercial Metrics
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Monthly Contract Value:</span>
                <span className="font-bold text-amber-600">{formatCurrency(customer.monthlySpend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lifetime Pages Processed:</span>
                <span className="font-semibold text-slate-800">{formatNumber(customer.totalUsagePages)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Active Licenses:</span>
                <span className="font-semibold text-slate-800">{customerLicenses.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Active Subscriptions:</span>
                <span className="font-semibold text-slate-800">{customerSubs.length}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Members */}
      {activeTab === 'members' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Added Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customer.members?.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">{m.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{m.email}</td>
                      <td className="py-3 px-4">
                        <Badge variant="default" size="sm">{m.role}</Badge>
                      </td>
                      <td className="py-3 px-4"><Badge variant="success" size="sm">{m.status}</Badge></td>
                      <td className="py-3 px-4 text-slate-500">{m.addedDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Subscriptions */}
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
                    <th className="py-3 px-4">Rate</th>
                    <th className="py-3 px-4">Quota</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerSubs.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-amber-600">{s.id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{s.serviceName}</td>
                      <td className="py-3 px-4 text-slate-600">{s.packageName}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(s.price)}/mo</td>
                      <td className="py-3 px-4 text-slate-600">
                        {formatNumber(s.usedQuota)} / {formatNumber(s.totalQuota)} pgs
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="success" size="sm">{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Licenses */}
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
                    <th className="py-3 px-4">Expiration Date</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerLicenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{lic.id}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{lic.maskedKey}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{lic.serviceName}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(lic.expirationDate)}</td>
                      <td className="py-3 px-4">
                        <Badge variant="success" size="sm">{lic.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Usage */}
      {activeTab === 'usage' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Job ID</th>
                    <th className="py-3 px-4">File Name</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Pages</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerJobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-blue-600">{j.id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{j.fileName}</td>
                      <td className="py-3 px-4 text-slate-600">{j.serviceName}</td>
                      <td className="py-3 px-4 text-slate-700">{j.pageCount} pgs</td>
                      <td className="py-3 px-4 text-slate-500">{(j.processingDurationMs / 1000).toFixed(2)}s</td>
                      <td className="py-3 px-4"><Badge variant="success" size="sm">{j.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 6: Orders */}
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
                  {customerOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-amber-600">{o.orderNumber}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(o.date)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{o.packageName}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(o.amount)}</td>
                      <td className="py-3 px-4"><Badge variant="success" size="sm">{o.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 7: Audit History */}
      {activeTab === 'audit' && (
        <Card className="p-4 space-y-3">
          <h3 className="font-bold text-sm text-slate-900">Security & Provisioning Audit Log</h3>
          <div className="space-y-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span className="font-semibold text-slate-700">ACCOUNT_PROVISIONED</span>
                <span>2025-08-14 09:00</span>
              </div>
              <p className="text-slate-600 mt-0.5">Enterprise tenant FinCorp Global Technologies initialized.</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span className="font-semibold text-slate-700">SUBSCRIPTION_UPGRADED</span>
                <span>2026-01-01 09:05</span>
              </div>
              <p className="text-slate-600 mt-0.5">Upgraded to Smart Invoice OCR Enterprise Plan ($799/mo).</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
