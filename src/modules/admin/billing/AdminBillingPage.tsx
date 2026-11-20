import React, { useState } from 'react';
import { Search, Eye } from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Order, Payment } from '@/types';
import { formatCurrency, formatDate, formatNumber } from '@/utils/formatters';
import { useTranslation } from '@/i18n';

export const AdminBillingPage: React.FC = () => {
  const { t, dict } = useTranslation();
  const { orders, payments, subscriptions } = usePlatformStore();

  const [activeTab, setActiveTab] = useState('orders');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [isPaymentDetailOpen, setIsPaymentDetailOpen] = useState(false);

  const statusesMap = dict.common.statuses as Record<string, string>;

  const tabs = [
    { id: 'orders', label: t('adminBilling.tabOrders'), count: orders.length },
    { id: 'payments', label: t('adminBilling.tabPayments'), count: payments.length },
    { id: 'subscriptions', label: t('adminBilling.tabSubs'), count: subscriptions.length },
  ];

  const q = search.toLowerCase();

  const filteredOrders = orders.filter(
    (o) =>
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.customerEmail || '').toLowerCase().includes(q) ||
      o.serviceName.toLowerCase().includes(q) ||
      o.packageName.toLowerCase().includes(q)
  );

  const filteredPayments = payments.filter(
    (p) =>
      p.paymentNumber.toLowerCase().includes(q) ||
      p.orderNumber.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q) ||
      (p.customerEmail || '').toLowerCase().includes(q)
  );

  const filteredSubscriptions = subscriptions.filter(
    (s) =>
      s.id.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      (s.customerEmail || '').toLowerCase().includes(q) ||
      s.serviceName.toLowerCase().includes(q) ||
      s.packageName.toLowerCase().includes(q)
  );

  const orderStatusVariant = (status: string) => {
    if (status === 'completed') return 'success';
    if (status === 'failed' || status === 'cancelled') return 'danger';
    return 'warning';
  };

  const paymentStatusVariant = (status: string) => {
    if (status === 'successful') return 'success';
    if (status === 'failed') return 'danger';
    return 'warning';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: t('common.adminPortal'), path: '/admin/dashboard' },
              { label: t('adminBilling.breadcrumbCurrent') },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{t('adminBilling.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('adminBilling.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Search Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('adminBilling.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Tab 1: Orders */}
      {activeTab === 'orders' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('adminBilling.colOrderNum')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colCustomer')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colServicePkg')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colDate')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colAmount')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colMethod')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                    <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        {t('adminBilling.emptyOrders')}
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-amber-600">{o.orderNumber}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{o.customerName}</div>
                          {o.customerEmail && <div className="text-[11px] text-slate-500">{o.customerEmail}</div>}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-slate-800 font-medium">{o.serviceName}</div>
                          <div className="text-[11px] text-slate-500">{o.packageName}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">{formatDate(o.date)}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(o.amount, o.currency)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{o.paymentMethod}</td>
                        <td className="py-3.5 px-4">
                          <Badge variant={orderStatusVariant(o.status)} size="sm">
                            {statusesMap[o.status] || o.status}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            onClick={() => {
                              setSelectedOrder(o);
                              setIsOrderDetailOpen(true);
                            }}
                            variant="outline"
                            size="xs"
                          >
                            <Eye className="h-3 w-3 mr-1" /> {t('adminBilling.viewOrder')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Payments */}
      {activeTab === 'payments' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('adminBilling.colPaymentNum')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colOrderRef')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colCustomer')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colAmount')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colMethod')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colTimestamp')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                    <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        {t('adminBilling.emptyPayments')}
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{p.paymentNumber}</td>
                        <td className="py-3.5 px-4 font-mono text-amber-600">{p.orderNumber}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{p.customerName}</div>
                          {p.customerEmail && <div className="text-[11px] text-slate-500">{p.customerEmail}</div>}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(p.amount, p.currency)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{p.method}</td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">{formatDate(p.date)}</td>
                        <td className="py-3.5 px-4">
                          <Badge variant={paymentStatusVariant(p.status)} size="sm">
                            {statusesMap[p.status] || p.status}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            onClick={() => {
                              setSelectedPayment(p);
                              setIsPaymentDetailOpen(true);
                            }}
                            variant="outline"
                            size="xs"
                          >
                            <Eye className="h-3 w-3 mr-1" /> {t('common.details')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
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
                    <th className="py-3 px-4">{t('adminBilling.colSubId')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colCustomer')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colServicePkg')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colQuotaUsed')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colPeriod')}</th>
                    <th className="py-3 px-4">{t('adminBilling.colPrice')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        {t('adminBilling.emptySubs')}
                      </td>
                    </tr>
                  ) : (
                    filteredSubscriptions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-[11px] font-medium text-amber-600">{s.id}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{s.customerName}</div>
                          {s.customerEmail && <div className="text-[11px] text-slate-500">{s.customerEmail}</div>}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-slate-800 font-medium">{s.serviceName}</div>
                          <div className="text-[11px] text-slate-500">{s.packageName}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-blue-600">
                          {formatNumber(s.usedQuota)} / {formatNumber(s.totalQuota)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                          {formatDate(s.startDate)} → {formatDate(s.endDate)}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(s.price)}</td>
                        <td className="py-3.5 px-4">
                          <Badge variant={s.status === 'active' ? 'success' : 'warning'} size="sm">
                            {statusesMap[s.status] || s.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <Modal
          isOpen={isOrderDetailOpen}
          onClose={() => setIsOrderDetailOpen(false)}
          title={t('adminBilling.orderInspectTitle', { orderNumber: selectedOrder.orderNumber })}
          description={t('adminBilling.orderInspectDesc')}
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminLicenses.customerLabel')}</span>
                <span className="font-semibold text-slate-800">{selectedOrder.customerName}</span>
              </div>
              {selectedOrder.customerEmail && (
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('adminCustomers.emailLabel')}</span>
                  <span className="font-mono text-slate-700">{selectedOrder.customerEmail}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.serviceLabel')}</span>
                <span className="font-semibold text-slate-800">{selectedOrder.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.packageVersionLabel')}</span>
                <span className="font-semibold text-slate-800">{selectedOrder.packageName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.orderDateLabel')}</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedOrder.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.paymentChannelLabel')}</span>
                <span className="font-semibold text-slate-800">{selectedOrder.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.statusLabel')}</span>
                <span className="font-semibold text-slate-800">
                  {statusesMap[selectedOrder.status] || selectedOrder.status}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span>{t('billing.totalAmountLabel')}</span>
                <span className="text-amber-600">{formatCurrency(selectedOrder.amount, selectedOrder.currency)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setIsOrderDetailOpen(false)} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
                {t('common.close')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <Modal
          isOpen={isPaymentDetailOpen}
          onClose={() => setIsPaymentDetailOpen(false)}
          title={t('adminBilling.paymentInspectTitle', { paymentNumber: selectedPayment.paymentNumber })}
          description={t('adminBilling.paymentInspectDesc', { orderNumber: selectedPayment.orderNumber })}
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminLicenses.customerLabel')}</span>
                <span className="font-semibold text-slate-800">{selectedPayment.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.paymentChannelLabel')}</span>
                <span className="font-semibold text-slate-800">{selectedPayment.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminBilling.txRefLabel')}</span>
                <span className="font-mono text-slate-700">{selectedPayment.transactionReference || '—'}</span>
              </div>
              {selectedPayment.failureReason && (
                <div className="flex justify-between text-rose-600">
                  <span>{t('adminBilling.failureReasonLabel')}</span>
                  <span className="font-medium">{selectedPayment.failureReason}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span>{t('billing.totalAmountLabel')}</span>
                <span className="text-amber-600">{formatCurrency(selectedPayment.amount, selectedPayment.currency)}</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setIsPaymentDetailOpen(false)} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
                {t('common.close')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
