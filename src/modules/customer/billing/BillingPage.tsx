import React, { useState, useEffect } from 'react';
import { Download, Eye } from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { Order, Invoice } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { useTranslation, localizeServiceName, localizePackageName } from '@/i18n';

export const BillingPage: React.FC = () => {
  const { t, dict } = useTranslation();
  const { orders, invoices, payments, activeCustomerId, currentUser, syncWithBackend } = usePlatformStore();

  useEffect(() => {
    syncWithBackend();
  }, []);

  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const customerOrders = orders.filter((o) => o.customerId === effectiveCustomerId);
  const customerInvoices = invoices.filter((i) => i.customerId === effectiveCustomerId);
  const customerPayments = payments.filter((p) => p.customerId === effectiveCustomerId);

  const [activeTab, setActiveTab] = useState<string>('orders');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [isInvoiceDetailOpen, setIsInvoiceDetailOpen] = useState(false);

  const tabs = [
    { id: 'orders', label: t('billing.tabOrders'), count: customerOrders.length },
    { id: 'invoices', label: t('billing.tabInvoices'), count: customerInvoices.length },
    { id: 'payments', label: t('billing.tabPayments'), count: customerPayments.length },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: t('common.customerPortal'), path: '/app/dashboard' },
              { label: t('billing.breadcrumbCurrent') },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{t('billing.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('billing.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Orders */}
      {activeTab === 'orders' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('billing.colOrderNum')}</th>
                    <th className="py-3 px-4">{t('billing.colServicePlan')}</th>
                    <th className="py-3 px-4">{t('billing.colDate')}</th>
                    <th className="py-3 px-4">{t('billing.colAmount')}</th>
                    <th className="py-3 px-4">{t('billing.colPaymentMethod')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                    <th className="py-3 px-4 text-right">{t('common.details')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerOrders.length > 0 ? (
                    customerOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-blue-600">{ord.orderNumber}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">{localizeServiceName(ord.serviceName, dict)}</div>
                          <div className="text-[11px] text-slate-500">{localizePackageName(ord.packageName, dict)}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{formatDate(ord.date)}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(ord.amount)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{ord.paymentMethod}</td>
                        <td className="py-3.5 px-4">
                          {ord.status === 'completed' && <Badge variant="success">{t('common.statuses.completed')}</Badge>}
                          {ord.status === 'pending' && <Badge variant="warning">{t('common.statuses.pending')}</Badge>}
                          {ord.status === 'failed' && <Badge variant="danger">{t('common.statuses.failed')}</Badge>}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            onClick={() => {
                              setSelectedOrder(ord);
                              setIsOrderDetailOpen(true);
                            }}
                            variant="outline"
                            size="xs"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            {t('billing.viewOrder')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        {t('billing.emptyOrders')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Invoices */}
      {activeTab === 'invoices' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('billing.colInvoiceNum')}</th>
                    <th className="py-3 px-4">{t('billing.colIssueDate')}</th>
                    <th className="py-3 px-4">{t('billing.colDueDate')}</th>
                    <th className="py-3 px-4">{t('billing.colTotalAmount')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                    <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerInvoices.length > 0 ? (
                    customerInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{inv.invoiceNumber}</td>
                        <td className="py-3.5 px-4 text-slate-600">{formatDate(inv.issueDate)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{formatDate(inv.dueDate)}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(inv.amount)}</td>
                        <td className="py-3.5 px-4">
                          <Badge variant="success">{t('common.statuses.completed')}</Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setIsInvoiceDetailOpen(true);
                              }}
                              variant="outline"
                              size="xs"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {t('common.view')}
                            </Button>
                            <Button variant="ghost" size="xs">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        {t('billing.emptyInvoices')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Payments */}
      {activeTab === 'payments' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('billing.colTxId')}</th>
                    <th className="py-3 px-4">{t('billing.colOrderRef')}</th>
                    <th className="py-3 px-4">{t('billing.colTimestamp')}</th>
                    <th className="py-3 px-4">{t('billing.colPaymentMethod')}</th>
                    <th className="py-3 px-4">{t('billing.colAmount')}</th>
                    <th className="py-3 px-4 text-right">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerPayments.length > 0 ? (
                    customerPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{p.id}</td>
                        <td className="py-3.5 px-4 font-mono text-blue-600">{p.orderNumber || p.orderId}</td>
                        <td className="py-3.5 px-4 text-slate-600">{formatDate(p.date)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{p.method}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(p.amount)}</td>
                        <td className="py-3.5 px-4 text-right">
                          <Badge variant="success">{t('common.statuses.successful')}</Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        {t('billing.emptyPayments')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Detail Modal */}
      <Modal
        isOpen={isOrderDetailOpen}
        onClose={() => setIsOrderDetailOpen(false)}
        title={t('billing.orderDetailTitle', { orderNumber: selectedOrder?.orderNumber || '' })}
        description={t('billing.orderDetailDesc')}
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.serviceLabel')}</span>
                <span className="font-semibold text-slate-900">{localizeServiceName(selectedOrder.serviceName, dict)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.packageVersionLabel')}</span>
                <span className="font-semibold text-slate-900">{localizePackageName(selectedOrder.packageName, dict)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.orderDateLabel')}</span>
                <span className="text-slate-700">{formatDate(selectedOrder.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.paymentChannelLabel')}</span>
                <span className="text-slate-700">{selectedOrder.paymentMethod}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-sm">
                <span>{t('billing.totalAmountLabel')}</span>
                <span className="text-blue-600">{formatCurrency(selectedOrder.amount)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setIsOrderDetailOpen(false)} variant="outline" size="sm">
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Invoice Detail Modal */}
      <Modal
        isOpen={isInvoiceDetailOpen}
        onClose={() => setIsInvoiceDetailOpen(false)}
        title={t('billing.invoiceDetailTitle', { invoiceNumber: selectedInvoice?.invoiceNumber || '' })}
        description={t('billing.invoiceDetailDesc')}
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.invoiceNumberLabel')}</span>
                <span className="font-mono font-semibold">{selectedInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.billToLabel')}</span>
                <span className="font-semibold">{selectedInvoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.issueDateLabel')}</span>
                <span>{formatDate(selectedInvoice.issueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('billing.statusLabel')}</span>
                <Badge variant="success">{t('common.statuses.completed')}</Badge>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-sm">
                <span>{t('billing.amountPaidLabel')}</span>
                <span className="text-emerald-600">{formatCurrency(selectedInvoice.amount)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setIsInvoiceDetailOpen(false)} variant="outline" size="sm">
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
