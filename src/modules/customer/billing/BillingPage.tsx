import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Download,
  FileText,
  CheckCircle2,
  Receipt,
  Search,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { Order, Invoice, Payment } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

export const BillingPage: React.FC = () => {
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
    { id: 'orders', label: 'Order History', count: customerOrders.length },
    { id: 'invoices', label: 'Invoices', count: customerInvoices.length },
    { id: 'payments', label: 'Payment Receipts', count: customerPayments.length },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'Billing & Invoices' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Billing & Invoices</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            View commercial orders, download paid tax invoices, and verify payment methods.
          </p>
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
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Purchased Service & Plan</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerOrders.length > 0 ? (
                    customerOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-blue-600">{ord.orderNumber}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">{ord.serviceName}</div>
                          <div className="text-[11px] text-slate-500">{ord.packageName}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{formatDate(ord.date)}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(ord.amount)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{ord.paymentMethod}</td>
                        <td className="py-3.5 px-4">
                          {ord.status === 'completed' && <Badge variant="success">Completed</Badge>}
                          {ord.status === 'pending' && <Badge variant="warning">Pending</Badge>}
                          {ord.status === 'failed' && <Badge variant="danger">Failed</Badge>}
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
                            View Order
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Chưa có đơn hàng nào được ghi nhận cho tài khoản này.
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
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Issue Date</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Total Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
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
                          <Badge variant="success">Paid</Badge>
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
                              View
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
                        Chưa có hóa đơn nào cho tài khoản này.
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
                    <th className="py-3 px-4">Transaction ID</th>
                    <th className="py-3 px-4">Order Ref</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerPayments.length > 0 ? (
                    customerPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{p.id}</td>
                        <td className="py-3.5 px-4 font-mono text-blue-600">{p.orderNumber || p.orderId}</td>
                        <td className="py-3.5 px-4 text-slate-600">{p.date}</td>
                        <td className="py-3.5 px-4 text-slate-600">{p.method}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(p.amount)}</td>
                        <td className="py-3.5 px-4 text-right">
                          <Badge variant="success">Successful</Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Chưa có giao dịch thanh toán nào được ghi nhận cho tài khoản này.
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
        title={`Order Details: ${selectedOrder?.orderNumber}`}
        description="Authoritative order breakdown and package snapshot"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-semibold text-slate-900">{selectedOrder.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Package Version:</span>
                <span className="font-semibold text-slate-900">{selectedOrder.packageName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order Date:</span>
                <span className="text-slate-700">{formatDate(selectedOrder.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Channel:</span>
                <span className="text-slate-700">{selectedOrder.paymentMethod}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-sm">
                <span>Total Amount:</span>
                <span className="text-blue-600">{formatCurrency(selectedOrder.amount)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setIsOrderDetailOpen(false)} variant="outline" size="sm">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Invoice Detail Modal */}
      <Modal
        isOpen={isInvoiceDetailOpen}
        onClose={() => setIsInvoiceDetailOpen(false)}
        title={`Invoice: ${selectedInvoice?.invoiceNumber}`}
        description="Formal digital tax receipt and payment confirmation"
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice Number:</span>
                <span className="font-mono font-semibold">{selectedInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bill To:</span>
                <span className="font-semibold">{selectedInvoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Issue Date:</span>
                <span>{formatDate(selectedInvoice.issueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <Badge variant="success">Paid</Badge>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-sm">
                <span>Amount Paid:</span>
                <span className="text-emerald-600">{formatCurrency(selectedInvoice.amount)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setIsInvoiceDetailOpen(false)} variant="outline" size="sm">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
