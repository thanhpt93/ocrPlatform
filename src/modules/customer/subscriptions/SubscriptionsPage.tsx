import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Subscription } from '@/types';
import { formatDate, formatNumber, formatCurrency } from '@/utils/formatters';

export const SubscriptionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { subscriptions, activeCustomerId, currentUser, renewSubscription, cancelSubscription, syncWithBackend } = usePlatformStore();

  useEffect(() => {
    syncWithBackend();
  }, []);

  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const customerSubs = subscriptions.filter(
    (s) => s.customerId === effectiveCustomerId || (!currentUser && s.customerId === activeCustomerId)
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRenewOpen, setIsRenewOpen] = useState(false);

  const filteredSubs = customerSubs.filter((s) => {
    const matchesSearch =
      s.serviceName.toLowerCase().includes(search.toLowerCase()) ||
      s.packageName.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenDetail = (sub: Subscription) => {
    setSelectedSub(sub);
    setIsDetailOpen(true);
  };

  const handleOpenRenew = (sub: Subscription) => {
    setSelectedSub(sub);
    setIsRenewOpen(true);
  };

  const handleConfirmRenew = () => {
    if (selectedSub) {
      renewSubscription(selectedSub.id);
      setIsRenewOpen(false);
    }
  };

  const handleConfirmCancel = () => {
    if (selectedSub) {
      cancelSubscription(selectedSub.id);
      setIsDetailOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'My Subscriptions' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">My Subscriptions</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your recurring OCR plan quotas, billing periods, and renewal statuses.
          </p>
        </div>
        <Button onClick={() => navigate('/app/marketplace')} variant="primary" size="sm">
          <Sparkles className="h-4 w-4 mr-1 text-blue-200" />
          Subscribe to New Service
        </Button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          {['all', 'active', 'expiring', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                statusFilter === st ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search subscriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Subscriptions Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Subscription ID</th>
                  <th className="py-3 px-4">OCR Service</th>
                  <th className="py-3 px-4">Package</th>
                  <th className="py-3 px-4">Start Date</th>
                  <th className="py-3 px-4">Expiration Date</th>
                  <th className="py-3 px-4">Quota (Used / Total)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubs.length > 0 ? (
                  filteredSubs.map((sub) => {
                    const pct = Math.min(100, Math.round((sub.usedQuota / sub.totalQuota) * 100));
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-blue-600">{sub.id}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900">{sub.serviceName}</td>
                        <td className="py-3.5 px-4 text-slate-700">{sub.packageName}</td>
                        <td className="py-3.5 px-4 text-slate-500">{formatDate(sub.startDate)}</td>
                        <td className="py-3.5 px-4 text-slate-500">{formatDate(sub.endDate)}</td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] font-medium">
                              <span>{formatNumber(sub.usedQuota)}</span>
                              <span className="text-slate-400">/ {formatNumber(sub.totalQuota)}</span>
                            </div>
                            <div className="w-28 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct > 80 ? 'bg-amber-500' : 'bg-blue-600'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {sub.status === 'active' && <Badge variant="success">Active</Badge>}
                          {sub.status === 'expiring' && <Badge variant="warning">Expiring</Badge>}
                          {sub.status === 'expired' && <Badge variant="danger">Expired</Badge>}
                          {sub.status === 'cancelled' && <Badge variant="slate">Cancelled</Badge>}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button onClick={() => handleOpenDetail(sub)} variant="outline" size="xs">
                              Details
                            </Button>
                            <Button onClick={() => handleOpenRenew(sub)} variant="secondary" size="xs">
                              Renew
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No subscriptions found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Detail Modal */}
      {selectedSub && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Subscription Details: ${selectedSub.id}`}
          description="Detailed quota consumption and billing configuration"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block">Service:</span>
                <span className="font-semibold text-slate-800">{selectedSub.serviceName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Package Tier:</span>
                <span className="font-semibold text-slate-800">{selectedSub.packageName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Monthly Rate:</span>
                <span className="font-semibold text-blue-600">{formatCurrency(selectedSub.price)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Billing Cycle:</span>
                <span className="font-semibold text-slate-800 capitalize">{selectedSub.billingCycle}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Start Date:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedSub.startDate)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Expiration Date:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedSub.endDate)}</span>
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
              <h4 className="text-xs font-bold text-slate-800">Quota Tracking</h4>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Used: {formatNumber(selectedSub.usedQuota)} pages</span>
                <span>Remaining: {formatNumber(selectedSub.remainingQuota)} pages</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full"
                  style={{ width: `${Math.min(100, (selectedSub.usedQuota / selectedSub.totalQuota) * 100)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedSub.status !== 'cancelled' ? (
                <Button onClick={handleConfirmCancel} variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel Subscription
                </Button>
              ) : (
                <span className="text-xs text-slate-400 italic">Subscription is already cancelled.</span>
              )}
              <Button onClick={() => setIsDetailOpen(false)} variant="primary" size="sm">
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Subscription Renewal Modal */}
      {selectedSub && (
        <Modal
          isOpen={isRenewOpen}
          onClose={() => setIsRenewOpen(false)}
          title="Renew Subscription Quota"
          description={`Extend ${selectedSub.packageName} for another billing cycle`}
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-semibold text-slate-800">{selectedSub.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Expiration:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedSub.endDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Additional Pages:</span>
                <span className="font-semibold text-emerald-600">+{formatNumber(selectedSub.totalQuota)} pages</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span>Renewal Charge:</span>
                <span className="text-blue-600">{formatCurrency(selectedSub.price)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={() => setIsRenewOpen(false)} variant="outline" size="sm">
                Cancel
              </Button>
              <Button onClick={handleConfirmRenew} variant="primary" size="sm">
                Confirm & Renew ({formatCurrency(selectedSub.price)})
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
