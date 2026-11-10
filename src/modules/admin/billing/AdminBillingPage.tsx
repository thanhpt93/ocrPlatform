import React, { useState } from 'react';
import {
  CreditCard,
  Download,
  Search,
  Eye,
  DollarSign,
  Receipt,
  CheckCircle2,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Order, Invoice, Payment } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

export const AdminBillingPage: React.FC = () => {
  const { orders, invoices, payments } = usePlatformStore();

  const [activeTab, setActiveTab] = useState('orders');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [isInvoiceDetailOpen, setIsInvoiceDetailOpen] = useState(false);

  const tabs = [
    { id: 'orders', label: 'All Customer Orders', count: orders.length },
    { id: 'invoices', label: 'Invoices Issued', count: invoices.length },
    { id: 'payments', label: 'Processed Payments', count: payments.length },
  ];

  const filteredOrders = orders.filter(
    (o) =>
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.serviceName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredInvoices = invoices.filter(
    (i) =>
      i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      i.customerName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'Order & Billing' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Financial & Order Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit multi-tenant commercial orders, transaction settlements, and corporate invoice balances.
          </p>
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
            placeholder="Search orders, invoices, or customer..."
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
                    <th className="py-3 px-4">Order Number</th>
                    <th className="py-3 px-4">Customer Organization</th>
                    <th className="py-3 px-4">Service & Package</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-amber-600">{o.orderNumber}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{o.customerName}</td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800 font-medium">{o.serviceName}</div>
                        <div className="text-[11px] text-slate-500">{o.packageName}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">{formatDate(o.date)}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(o.amount)}</td>
                      <td className="py-3.5 px-4 text-slate-600">{o.paymentMethod}</td>
                      <td className="py-3.5 px-4">
                        <Badge variant="success" size="sm">{o.status}</Badge>
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
                          <Eye className="h-3 w-3 mr-1" /> View Order
                        </Button>
                      </td>
                    </tr>
                  ))}
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
                    <th className="py-3 px-4">Customer Organization</th>
                    <th className="py-3 px-4">Issue Date</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{inv.invoiceNumber}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{inv.customerName}</td>
                      <td className="py-3.5 px-4 text-slate-500">{formatDate(inv.issueDate)}</td>
                      <td className="py-3.5 px-4 text-slate-500">{formatDate(inv.dueDate)}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(inv.amount)}</td>
                      <td className="py-3.5 px-4">
                        <Badge variant="success" size="sm">{inv.status}</Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setIsInvoiceDetailOpen(true);
                          }}
                          variant="outline"
                          size="xs"
                        >
                          <Eye className="h-3 w-3 mr-1" /> Details
                        </Button>
                      </td>
                    </tr>
                  ))}
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
                    <th className="py-3 px-4">Customer Organization</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{p.paymentNumber}</td>
                      <td className="py-3.5 px-4 font-mono text-amber-600">{p.orderNumber}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{p.customerName}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(p.amount)}</td>
                      <td className="py-3.5 px-4 text-slate-600">{p.method}</td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">{p.date}</td>
                      <td className="py-3.5 px-4 text-right">
                        <Badge variant="success" size="sm">Settled</Badge>
                      </td>
                    </tr>
                  ))}
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
          title={`Order Inspection: ${selectedOrder.orderNumber}`}
          description="Detailed transaction record and subscription linkage"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Organization:</span>
                <span className="font-semibold text-slate-800">{selectedOrder.customerName}</span>
              </div>
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
                <span className="text-slate-500">Payment Channel:</span>
                <span className="font-semibold text-slate-800">{selectedOrder.paymentMethod}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span>Amount:</span>
                <span className="text-amber-600">{formatCurrency(selectedOrder.amount)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setIsOrderDetailOpen(false)} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
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
          description={`Customer: ${selectedInvoice.customerName}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{selectedInvoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Issue Date:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedInvoice.issueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Due Date:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedInvoice.dueDate)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold">
                <span>Total Amount:</span>
                <span className="text-amber-600">{formatCurrency(selectedInvoice.amount)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setIsInvoiceDetailOpen(false)} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
