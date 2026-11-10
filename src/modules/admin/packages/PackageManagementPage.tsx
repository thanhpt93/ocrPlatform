import React, { useState } from 'react';
import {
  Package as PackageIcon,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { Package, PackageTier, QuotaType, Duration, BillingType, OveragePolicy } from '@/types';
import { formatCurrency, formatNumber } from '@/utils/formatters';

export const PackageManagementPage: React.FC = () => {
  const { packages, services, addPackage, updatePackage, deletePackage } = usePlatformStore();

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [tier, setTier] = useState<PackageTier>('Professional');
  const [serviceId, setServiceId] = useState(services[0]?.id || 'srv-1');
  const [price, setPrice] = useState(199);
  const [currency, setCurrency] = useState<'USD' | 'VND'>('USD');
  const [quotaType, setQuotaType] = useState<QuotaType>('Page');
  const [quotaAmount, setQuotaAmount] = useState(10000);
  const [duration, setDuration] = useState<Duration>('monthly');
  const [billingType, setBillingType] = useState<BillingType>('prepaid');
  const [apiAccess, setApiAccess] = useState(true);
  const [batchProcessing, setBatchProcessing] = useState(true);
  const [priorityProcessing, setPriorityProcessing] = useState(false);
  const [autoRenewal, setAutoRenewal] = useState(true);
  const [overagePolicy, setOveragePolicy] = useState<OveragePolicy>('charge_per_unit');
  const [status, setStatus] = useState<'active' | 'inactive' | 'archived'>('active');
  const [features, setFeatures] = useState('REST API, Webhook callbacks, 99.9% SLA');

  const tiers = ['All', 'Starter', 'Professional', 'Enterprise', 'Custom'];

  const filteredPackages = packages.filter((p) => {
    const matchesTier = tierFilter === 'All' || p.tier === tierFilter;
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.serviceName.toLowerCase().includes(search.toLowerCase());
    return matchesTier && matchesSearch;
  });

  const handleOpenCreate = () => {
    setEditingPackage(null);
    setCode(`PKG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
    setName('Professional Plan');
    setTier('Professional');
    setServiceId(services[0]?.id || 'srv-1');
    setPrice(199);
    setCurrency('USD');
    setQuotaType('Page');
    setQuotaAmount(10000);
    setDuration('monthly');
    setBillingType('prepaid');
    setApiAccess(true);
    setBatchProcessing(true);
    setPriorityProcessing(true);
    setAutoRenewal(true);
    setOveragePolicy('charge_per_unit');
    setStatus('active');
    setFeatures('10,000 pages per month\nREST API & Batch ingestion\nPriority GPU worker queue\nEmail & Slack support');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setCode(pkg.code);
    setName(pkg.name);
    setTier(pkg.tier);
    setServiceId(pkg.serviceId);
    setPrice(pkg.price);
    setCurrency(pkg.currency);
    setQuotaType(pkg.quotaType);
    setQuotaAmount(pkg.quotaAmount);
    setDuration(pkg.duration);
    setBillingType(pkg.billingType);
    setApiAccess(pkg.apiAccess);
    setBatchProcessing(pkg.batchProcessing);
    setPriorityProcessing(pkg.priorityProcessing);
    setAutoRenewal(pkg.autoRenewal);
    setOveragePolicy(pkg.overagePolicy);
    setStatus(pkg.status);
    setFeatures(pkg.features.join('\n'));
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const service = services.find((s) => s.id === serviceId);

    const payload = {
      code,
      name,
      tier,
      serviceId,
      serviceName: service ? service.name : 'Unknown Service',
      price: Number(price),
      currency,
      quotaType,
      quotaAmount: Number(quotaAmount),
      duration,
      billingType,
      apiAccess,
      batchProcessing,
      priorityProcessing,
      autoRenewal,
      overagePolicy,
      status,
      features: features.split('\n').filter((f) => f.trim().length > 0),
    };

    if (editingPackage) {
      updatePackage(editingPackage.id, payload);
    } else {
      addPackage(payload);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'Package Management' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Package & Pricing Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure customer quota bundles, billing types, API permissions, and overage policies.
          </p>
        </div>
        <Button onClick={handleOpenCreate} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
          <Plus className="h-4 w-4 mr-1" />
          Create New Package
        </Button>
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
            placeholder="Search packages by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Packages Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Package Name</th>
                  <th className="py-3 px-4">OCR Service</th>
                  <th className="py-3 px-4">Tier</th>
                  <th className="py-3 px-4">Quota Amount</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPackages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-amber-600">{pkg.code}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">{pkg.name}</td>
                    <td className="py-3.5 px-4 text-slate-600">{pkg.serviceName}</td>
                    <td className="py-3.5 px-4">
                      <Badge
                        variant={
                          pkg.tier === 'Enterprise'
                            ? 'purple'
                            : pkg.tier === 'Professional'
                            ? 'default'
                            : 'slate'
                        }
                        size="sm"
                      >
                        {pkg.tier}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-blue-600">
                      {formatNumber(pkg.quotaAmount)} {pkg.quotaType}s
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(pkg.price)}</td>
                    <td className="py-3.5 px-4 capitalize text-slate-600">{pkg.duration}</td>
                    <td className="py-3.5 px-4">
                      {pkg.status === 'active' && <Badge variant="success">Active</Badge>}
                      {pkg.status === 'inactive' && <Badge variant="warning">Inactive</Badge>}
                      {pkg.status === 'archived' && <Badge variant="slate">Archived</Badge>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button onClick={() => handleOpenEdit(pkg)} variant="outline" size="xs">
                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button
                          onClick={() => {
                            if (confirm(`Delete package ${pkg.name}? Existing subscriptions will not be affected.`)) {
                              deletePackage(pkg.id);
                            }
                          }}
                          variant="ghost"
                          size="xs"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Package Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPackage ? `Edit Package: ${editingPackage.name}` : 'Create Pricing Package'}
        description="Configure commercial rates, quota allocations, and processing capabilities"
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input
              label="Package Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              hint="e.g. INV-PRO"
            />
            <Input
              label="Package Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Professional Plan"
            />
            <Select
              label="Package Tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as PackageTier)}
            >
              <option value="Starter">Starter</option>
              <option value="Professional">Professional</option>
              <option value="Enterprise">Enterprise</option>
              <option value="Custom">Custom</option>
            </Select>
            <Select
              label="Associated OCR Service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <Input
              label="Price ($)"
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              required
            />
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
            >
              <option value="USD">USD ($)</option>
              <option value="VND">VND (₫)</option>
            </Select>
            <Select
              label="Quota Metric"
              value={quotaType}
              onChange={(e) => setQuotaType(e.target.value as QuotaType)}
            >
              <option value="Page">Pages</option>
              <option value="Document">Documents</option>
              <option value="Credit">Credits</option>
            </Select>
            <Input
              label="Quota Amount"
              type="number"
              value={quotaAmount}
              onChange={(e) => setQuotaAmount(Number(e.target.value))}
              required
            />
            <Select
              label="Duration Period"
              value={duration}
              onChange={(e) => setDuration(e.target.value as Duration)}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="pay_as_you_go">Pay-As-You-Go</option>
            </Select>
            <Select
              label="Billing Type"
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as BillingType)}
            >
              <option value="prepaid">Prepaid (Billed upfront)</option>
              <option value="postpaid">Postpaid (Invoice at month-end)</option>
            </Select>
            <Select
              label="Overage Policy"
              value={overagePolicy}
              onChange={(e) => setOveragePolicy(e.target.value as OveragePolicy)}
            >
              <option value="block">Block (Hard stop when quota reaches 0)</option>
              <option value="charge_per_unit">Charge Per Unit ($0.02 / page)</option>
              <option value="grace_period">Grace Period (10% overage allowed)</option>
            </Select>
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="active">Active (Visible in Marketplace)</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </Select>
          </div>

          {/* Feature Toggles */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={apiAccess}
                onChange={(e) => setApiAccess(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              API Access
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={batchProcessing}
                onChange={(e) => setBatchProcessing(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              Batch Processing
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={priorityProcessing}
                onChange={(e) => setPriorityProcessing(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              Priority Queue
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={autoRenewal}
                onChange={(e) => setAutoRenewal(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              Auto Renewal
            </label>
          </div>

          <Textarea
            label="Package Features (One per line)"
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            rows={4}
            hint="Features displayed to customers on the pricing selection cards"
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="outline" size="sm">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
              {editingPackage ? 'Save Package' : 'Create Package'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
