import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Subscription } from '@/types';
import { formatDate, formatNumber, formatCurrency } from '@/utils/formatters';
import { useTranslation, localizeServiceName, localizePackageName } from '@/i18n';

export const SubscriptionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, dict } = useTranslation();
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
    const q = search.toLowerCase();
    const matchesSearch =
      s.serviceName.toLowerCase().includes(q) ||
      localizeServiceName(s.serviceName, dict).toLowerCase().includes(q) ||
      s.packageName.toLowerCase().includes(q) ||
      localizePackageName(s.packageName, dict).toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q);
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
          <Breadcrumbs items={[{ label: t('common.customerPortal'), path: '/app/dashboard' }, { label: t('subscriptions.breadcrumbCurrent') }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{t('subscriptions.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('subscriptions.subtitle')}
          </p>
        </div>
        <Button onClick={() => navigate('/app/marketplace')} variant="primary" size="sm">
          <Sparkles className="h-4 w-4 mr-1 text-blue-200" />
          {t('subscriptions.subscribeNew')}
        </Button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          {(['all', 'active', 'expiring', 'cancelled'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === st ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t(`common.statuses.${st}`)}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('subscriptions.searchPlaceholder')}
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
                  <th className="py-3 px-4">{t('subscriptions.colId')}</th>
                  <th className="py-3 px-4">{t('subscriptions.colService')}</th>
                  <th className="py-3 px-4">{t('subscriptions.colPackage')}</th>
                  <th className="py-3 px-4">{t('subscriptions.colStartDate')}</th>
                  <th className="py-3 px-4">{t('subscriptions.colEndDate')}</th>
                  <th className="py-3 px-4">{t('subscriptions.colQuota')}</th>
                  <th className="py-3 px-4">{t('common.status')}</th>
                  <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubs.length > 0 ? (
                  filteredSubs.map((sub) => {
                    const pct = sub.totalQuota > 0 ? Math.min(100, Math.round((sub.usedQuota / sub.totalQuota) * 100)) : 0;
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-blue-600">{sub.id}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900">{localizeServiceName(sub.serviceName, dict)}</td>
                        <td className="py-3.5 px-4 text-slate-700">{localizePackageName(sub.packageName, dict)}</td>
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
                          {sub.status === 'active' && <Badge variant="success">{t('common.statuses.active')}</Badge>}
                          {sub.status === 'expiring' && <Badge variant="warning">{t('common.statuses.expiring')}</Badge>}
                          {sub.status === 'expired' && <Badge variant="danger">{t('common.statuses.expired')}</Badge>}
                          {sub.status === 'cancelled' && <Badge variant="slate">{t('common.statuses.cancelled')}</Badge>}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button onClick={() => handleOpenDetail(sub)} variant="outline" size="xs">
                              {t('common.details')}
                            </Button>
                            <Button onClick={() => handleOpenRenew(sub)} variant="secondary" size="xs">
                              {t('subscriptions.renewBtn')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      {t('subscriptions.empty')}
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
          title={t('subscriptions.detailTitle', { id: selectedSub.id })}
          description={t('subscriptions.detailDesc')}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block">{t('marketplace.serviceLabel')}</span>
                <span className="font-semibold text-slate-800">{localizeServiceName(selectedSub.serviceName, dict)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('marketplace.packageTierLabel')}</span>
                <span className="font-semibold text-slate-800">{localizePackageName(selectedSub.packageName, dict)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('subscriptions.monthlyRate')}</span>
                <span className="font-semibold text-blue-600">{formatCurrency(selectedSub.price)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('subscriptions.billingCycle')}</span>
                <span className="font-semibold text-slate-800 capitalize">
                  {t(`common.durations.${selectedSub.billingCycle}`) || selectedSub.billingCycle}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('subscriptions.startDate')}</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedSub.startDate)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('subscriptions.endDate')}</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedSub.endDate)}</span>
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
              <h4 className="text-xs font-bold text-slate-800">{t('subscriptions.quotaTracking')}</h4>
              <div className="flex justify-between text-xs text-slate-600">
                <span>{t('subscriptions.usedPages', { val: formatNumber(selectedSub.usedQuota) })}</span>
                <span>{t('subscriptions.remainingPages', { val: formatNumber(selectedSub.remainingQuota) })}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full"
                  style={{ width: `${selectedSub.totalQuota > 0 ? Math.min(100, (selectedSub.usedQuota / selectedSub.totalQuota) * 100) : 0}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedSub.status !== 'cancelled' ? (
                <Button onClick={handleConfirmCancel} variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('subscriptions.cancelSub')}
                </Button>
              ) : (
                <span className="text-xs text-slate-400 italic">{t('subscriptions.alreadyCancelled')}</span>
              )}
              <Button onClick={() => setIsDetailOpen(false)} variant="primary" size="sm">
                {t('common.done')}
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
          title={t('subscriptions.renewModalTitle')}
          description={t('subscriptions.renewModalDesc', { name: localizePackageName(selectedSub.packageName, dict) })}
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('marketplace.serviceLabel')}</span>
                <span className="font-semibold text-slate-800">{localizeServiceName(selectedSub.serviceName, dict)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('subscriptions.currentExpiration')}</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedSub.endDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('subscriptions.additionalPages')}</span>
                <span className="font-semibold text-emerald-600">
                  {t('subscriptions.additionalPagesVal', { val: formatNumber(selectedSub.totalQuota) })}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span>{t('subscriptions.renewalCharge')}</span>
                <span className="text-blue-600">{formatCurrency(selectedSub.price)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={() => setIsRenewOpen(false)} variant="outline" size="sm">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleConfirmRenew} variant="primary" size="sm">
                {t('subscriptions.confirmRenew', { price: formatCurrency(selectedSub.price) })}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
