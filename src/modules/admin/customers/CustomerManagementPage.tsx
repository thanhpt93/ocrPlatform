import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye } from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, formatDate, formatCurrency } from '@/utils/formatters';

export const CustomerManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { customers, toggleCustomerStatus, searchQuery } = usePlatformStore();

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const tiers = ['All', 'Enterprise', 'Professional', 'Starter', 'Standard'];
  const effectiveSearch = (search || searchQuery || '').toLowerCase();

  const filteredCustomers = customers.filter((c) => {
    const matchesTier = tierFilter === 'All' || c.tier === tierFilter;
    const matchesSearch =
      c.orgName.toLowerCase().includes(effectiveSearch) ||
      (c.fullName || '').toLowerCase().includes(effectiveSearch) ||
      c.id.toLowerCase().includes(effectiveSearch) ||
      c.email.toLowerCase().includes(effectiveSearch);
    return matchesTier && matchesSearch;
  });

  const handleToggleStatus = async (id: string) => {
    setUpdatingId(id);
    try {
      await toggleCustomerStatus(id);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'Customer Management' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Registered Customer Accounts</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real registered customer accounts, active subscriptions, license allocations, and actual billing totals.
          </p>
        </div>
        <Badge variant="default" size="sm">
          {customers.length} Registered {customers.length === 1 ? 'Account' : 'Accounts'}
        </Badge>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {tiers.map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tierFilter === t ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, company, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Customers Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Customer / Organization</th>
                  <th className="py-3 px-4">Customer ID</th>
                  <th className="py-3 px-4">Plan Tier</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4">Subscriptions</th>
                  <th className="py-3 px-4">Active Licenses</th>
                  <th className="py-3 px-4">Lifetime Usage</th>
                  <th className="py-3 px-4">Total Spend</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-400">
                      No registered customer accounts match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{cust.fullName || cust.orgName}</div>
                        <div className="text-[11px] text-slate-500">
                          {cust.email}
                          {cust.orgName && cust.fullName && cust.orgName !== cust.fullName ? ` • ${cust.orgName}` : ''}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] font-medium text-amber-600">{cust.id}</td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            cust.tier === 'Enterprise'
                              ? 'purple'
                              : cust.tier === 'Professional' || cust.tier === 'Premium'
                              ? 'default'
                              : 'slate'
                          }
                          size="sm"
                        >
                          {cust.tier}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">{formatDate(cust.registrationDate)}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {cust.activeSubscriptionsCount} active
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {cust.activeLicensesCount} active
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-blue-600 font-mono">
                        {formatNumber(cust.totalUsagePages)} units
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {formatCurrency(cust.totalSpend ?? cust.monthlySpend)}
                      </td>
                      <td className="py-3.5 px-4">
                        {cust.status === 'active' && <Badge variant="success">Active</Badge>}
                        {cust.status === 'suspended' && <Badge variant="danger">Suspended</Badge>}
                        {cust.status === 'pending' && <Badge variant="warning">Pending</Badge>}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            onClick={() => navigate(`/admin/customers/${cust.id}`)}
                            variant="outline"
                            size="xs"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            disabled={updatingId === cust.id}
                            onClick={() => handleToggleStatus(cust.id)}
                            variant={cust.status === 'active' ? 'ghost' : 'secondary'}
                            size="xs"
                            className={cust.status === 'active' ? 'text-red-600 hover:text-red-700' : 'text-emerald-700'}
                          >
                            {cust.status === 'active' ? 'Suspend' : 'Activate'}
                          </Button>
                        </div>
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
  );
};
