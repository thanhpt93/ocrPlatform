import React, { useState } from 'react';
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
  const { orders, invoices, payments, activeCustomerId } = usePlatformStore();

  const customerOrders = orders.filter((o) => o.customerId === activeCustomerId);
  const customerInvoices = invoices.filter((i) => i.customerId === activeCustomerId);
  const customerPayments = payments.filter((p) => p.customerId === activeCustomerId);

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
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Service & Package</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
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
                        No orders recorded.
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
                    <th className="py-3 px-4">Amount</th>
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
                          {inv.status === 'paid' && <Badge variant="success">Paid</Badge>}
                          {inv.status === 'unpaid' && <Badge variant="warning">Unpaid</Badge>}
                          {inv.status === 'overdue' && <Badge variant="danger">Overdue</Badge>}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setIsInvoiceDetailOpen(true);
                              }}
                              variant="outline"
                              size="xs"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Inspect
                            </Button>
                            <Button
                              onClick={() => alert(`Downloading PDF for invoice ${inv.invoiceNumber}...`)}
                              variant="secondary"
                              size="xs"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              PDF
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No invoices generated.
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
                    <th className="py-3 px-4">Payment #</th>
                    <th className="py-3 px-4">Order Ref</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerPayments.length > 0 ? (
                    customerPayments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{pay.paymentNumber}</td>
                        <td className="py-3.5 px-4 font-mono text-blue-600">{pay.orderNumber}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(pay.amount)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{pay.method}</td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">{pay.date}</td>
                        <td className="py-3.5 px-4 text-right">
                          <Badge variant="success">Successful</Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No payment transactions recorded.
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
      {selectedOrder && (
        <Modal
          isOpen={isOrderDetailOpen}
          onClose={() => setIsOrderDetailOpen(false)}
          title={`Order Summary: ${selectedOrder.orderNumber}`}
          description="Commercial receipt and subscription binding"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-semibold text-slate-800">{selectedOrder.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Package:</span>
                <span className="font-semibold text-slate-800">{selectedOrder.packageName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedOrder.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment:</span>
                <span className="font-semibold text-slate-800">{selectedOrder.paymentMethod}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span>Total Amount:</span>
                <span className="text-blue-600">{formatCurrency(selectedOrder.amount)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={() => setIsOrderDetailOpen(false)} variant="primary" size="sm">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <Modal
          isOpen={isInvoiceDetailOpen}
          onClose={() => setIsInvoiceDetailOpen(false)}
          title={`Tax Invoice: ${selectedInvoice.invoiceNumber}`}
          description={`Issued on ${formatDate(selectedInvoice.issueDate)}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Billed To:</span>
                <span className="font-semibold text-slate-800">{selectedInvoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Issue Date:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedInvoice.issueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Status:</span>
                <span className="font-semibold text-emerald-600 uppercase">{selectedInvoice.status}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span>Total Invoiced:</span>
                <span className="text-blue-600">{formatCurrency(selectedInvoice.amount)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                onClick={() => alert(`Downloading PDF for ${selectedInvoice.invoiceNumber}`)}
                variant="outline"
                size="sm"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download PDF
              </Button>
              <Button onClick={() => setIsInvoiceDetailOpen(false)} variant="primary" size="sm">
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
