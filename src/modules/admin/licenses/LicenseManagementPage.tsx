import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input, Select } from '@/components/ui/form-controls';
import { License, LicenseStatus } from '@/types';
import { formatDate, formatNumber } from '@/utils/formatters';

export const LicenseManagementPage: React.FC = () => {
  const {
    licenses,
    customers,
    packages,
    generateSingleLicense,
    generateBulkLicenses,
    setLicenseStatus,
  } = usePlatformStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [generatedKeysResult, setGeneratedKeysResult] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Generator form state
  const [genMode, setGenMode] = useState<'single' | 'bulk'>('single');
  const [targetCustomerId, setTargetCustomerId] = useState('');
  const [targetPackageId, setTargetPackageId] = useState('');
  const [bulkCount, setBulkCount] = useState(2);
  const [notes, setNotes] = useState('Admin manual complimentary grant');

  useEffect(() => {
    if (!targetCustomerId && customers.length > 0) {
      setTargetCustomerId(customers[0].id);
    }
  }, [customers, targetCustomerId]);

  useEffect(() => {
    if (!targetPackageId && packages.length > 0) {
      setTargetPackageId(packages[0].id);
    }
  }, [packages, targetPackageId]);

  const statuses = ['all', 'pending', 'active', 'suspended', 'expired', 'revoked'];

  const filteredLicenses = licenses.filter((lic) => {
    const matchesStatus = statusFilter === 'all' || lic.status === statusFilter;
    const matchesSearch =
      lic.id.toLowerCase().includes(search.toLowerCase()) ||
      lic.customerName.toLowerCase().includes(search.toLowerCase()) ||
      (lic.customerEmail || '').toLowerCase().includes(search.toLowerCase()) ||
      lic.serviceName.toLowerCase().includes(search.toLowerCase()) ||
      lic.maskedKey.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleCopyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCustomerId || !targetPackageId) {
      setGenError('Please select a registered customer and package.');
      return;
    }
    setGenError(null);
    setSubmitting(true);
    try {
      if (genMode === 'single') {
        const res = await generateSingleLicense({
          customerId: targetCustomerId,
          packageId: targetPackageId,
          notes,
        });
        setGeneratedKeysResult([res.rawKey]);
      } else {
        const res = await generateBulkLicenses({
          customerId: targetCustomerId,
          packageId: targetPackageId,
          count: Number(bulkCount),
          notes,
        });
        setGeneratedKeysResult(res.map((r) => r.rawKey));
      }
      setIsGenerateOpen(false);
    } catch (err: any) {
      setGenError(err?.message || 'Failed to generate license');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: LicenseStatus) => {
    await setLicenseStatus(id, newStatus, `Admin manual action: set status to ${newStatus}`);
    if (selectedLicense && selectedLicense.id === id) {
      setSelectedLicense({ ...selectedLicense, status: newStatus });
    }
  };

  const selectedPkgObj = packages.find((p) => p.id === targetPackageId);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'License Provisioning' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">License Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real cryptographic licenses provisioned for customer accounts, quota usage, and live status controls.
          </p>
        </div>
        <Button
          onClick={() => {
            setGenError(null);
            setIsGenerateOpen(true);
          }}
          disabled={customers.length === 0 || packages.length === 0}
          variant="primary"
          size="sm"
          className="bg-amber-600 hover:bg-amber-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          Generate License
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {statuses.map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === st ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
            placeholder="Search licenses or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Licenses Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">License ID</th>
                  <th className="py-3 px-4">Masked Key (Hashed in DB)</th>
                  <th className="py-3 px-4">Customer Account</th>
                  <th className="py-3 px-4">OCR Service</th>
                  <th className="py-3 px-4">Quota Used / Total</th>
                  <th className="py-3 px-4">Expiration Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLicenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No licenses found matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredLicenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] font-medium text-amber-600">{lic.id}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {lic.maskedKey}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{lic.customerName}</div>
                        {lic.customerEmail && <div className="text-[11px] text-slate-500">{lic.customerEmail}</div>}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <div>{lic.serviceName}</div>
                        {lic.packageName && <div className="text-[11px] text-slate-400">{lic.packageName}</div>}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-blue-600 font-mono">
                        {formatNumber(lic.usedQuota)} / {formatNumber(lic.quota)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">{formatDate(lic.expirationDate)}</td>
                      <td className="py-3.5 px-4">
                        {lic.status === 'active' && <Badge variant="success">Active</Badge>}
                        {lic.status === 'pending' && <Badge variant="warning">Pending</Badge>}
                        {lic.status === 'suspended' && <Badge variant="danger">Suspended</Badge>}
                        {lic.status === 'expired' && <Badge variant="slate">Expired</Badge>}
                        {lic.status === 'revoked' && <Badge variant="danger">Revoked</Badge>}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            onClick={() => {
                              setSelectedLicense(lic);
                              setIsDetailOpen(true);
                            }}
                            variant="outline"
                            size="xs"
                          >
                            <Eye className="h-3 w-3 mr-1" /> Inspect
                          </Button>

                          {lic.status === 'pending' && (
                            <Button
                              onClick={() => handleStatusChange(lic.id, 'active')}
                              variant="secondary"
                              size="xs"
                              className="text-emerald-700"
                            >
                              Activate
                            </Button>
                          )}

                          {lic.status === 'active' && (
                            <Button
                              onClick={() => handleStatusChange(lic.id, 'suspended')}
                              variant="ghost"
                              size="xs"
                              className="text-amber-700"
                            >
                              Suspend
                            </Button>
                          )}

                          {lic.status === 'suspended' && (
                            <Button
                              onClick={() => handleStatusChange(lic.id, 'active')}
                              variant="secondary"
                              size="xs"
                              className="text-emerald-700"
                            >
                              Unsuspend
                            </Button>
                          )}

                          {lic.status !== 'revoked' && (
                            <Button
                              onClick={() => {
                                if (confirm(`Revoke license ${lic.maskedKey}? This will permanently invalidate client API calls.`)) {
                                  handleStatusChange(lic.id, 'revoked');
                                }
                              }}
                              variant="ghost"
                              size="xs"
                              className="text-red-600 hover:text-red-700"
                            >
                              Revoke
                            </Button>
                          )}
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

      {/* Generate Single / Bulk Licenses Modal */}
      <Modal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        title="Complimentary License Provisioning"
        description="Issue cryptographically signed license keys in the database for a real customer"
        maxWidth="lg"
      >
        <form onSubmit={handleGenerateSubmit} className="space-y-4">
          {genError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{genError}</span>
            </div>
          )}

          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setGenMode('single')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                genMode === 'single' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'
              }`}
            >
              Single License
            </button>
            <button
              type="button"
              onClick={() => setGenMode('bulk')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                genMode === 'bulk' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'
              }`}
            >
              Bulk Generation (Batch)
            </button>
          </div>

          <Select
            label="Assign to Customer Account"
            value={targetCustomerId}
            onChange={(e) => setTargetCustomerId(e.target.value)}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName || c.orgName} ({c.email})
              </option>
            ))}
          </Select>

          <Select
            label="Package Plan (Defines Service, Quota & Entitlements)"
            value={targetPackageId}
            onChange={(e) => setTargetPackageId(e.target.value)}
          >
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.serviceName} — {p.name} ({formatNumber(p.quotaAmount)} {p.quotaType}s)
              </option>
            ))}
          </Select>

          {selectedPkgObj && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 grid grid-cols-2 gap-2">
              <div>Service: <strong className="text-slate-800">{selectedPkgObj.serviceName}</strong></div>
              <div>Quota: <strong className="text-blue-600">{formatNumber(selectedPkgObj.quotaAmount)} {selectedPkgObj.quotaType}s</strong></div>
            </div>
          )}

          <Input
            label="Audit Note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
          />

          {genMode === 'bulk' && (
            <Input
              label="Number of Licenses to Generate"
              type="number"
              min={2}
              max={20}
              value={bulkCount}
              onChange={(e) => setBulkCount(Number(e.target.value))}
              required
            />
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" onClick={() => setIsGenerateOpen(false)} variant="outline" size="sm">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
              {submitting ? 'Provisioning...' : 'Generate & Provision'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* One-time Raw Key Reveal Modal */}
      <Modal
        isOpen={generatedKeysResult.length > 0}
        onClose={() => setGeneratedKeysResult([])}
        title="License Key(s) Provisioned"
        description="Save these raw keys now. Only SHA-256 hashes are stored in the database."
        maxWidth="lg"
      >
        <div className="space-y-3 text-xs">
          {generatedKeysResult.map((rawKey, idx) => (
            <div key={idx} className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between font-mono">
              <span className="text-amber-400 font-semibold break-all">{rawKey}</span>
              <button
                onClick={() => handleCopyKey(rawKey, `gen-${idx}`)}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 ml-2 shrink-0"
              >
                {copiedKey === `gen-${idx}` ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setGeneratedKeysResult([])} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Inspect License Modal */}
      {selectedLicense && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`License Details: ${selectedLicense.id}`}
          description="Authorization parameters and real lifecycle history"
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between font-mono">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Masked Key (Secret Hash Protected)</span>
                <span className="text-amber-400 font-semibold">{selectedLicense.maskedKey}</span>
              </div>
              <button
                onClick={() => handleCopyKey(selectedLicense.maskedKey, 'admin-modal')}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Copy masked key"
              >
                {copiedKey === 'admin-modal' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block">Customer:</span>
                <span className="font-semibold text-slate-800">{selectedLicense.customerName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Service:</span>
                <span className="font-semibold text-slate-800">{selectedLicense.serviceName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Quota Usage:</span>
                <span className="font-semibold text-blue-600">
                  {formatNumber(selectedLicense.usedQuota)} / {formatNumber(selectedLicense.quota)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Status:</span>
                <span className="font-semibold capitalize text-slate-800">{selectedLicense.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Issued Date:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedLicense.startDate)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Expires:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedLicense.expirationDate)}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-800 mb-2">Lifecycle History</h4>
              <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white max-h-56 overflow-y-auto">
                {selectedLicense.history.length === 0 ? (
                  <p className="text-slate-400 text-center py-2">No lifecycle events logged.</p>
                ) : selectedLicense.history.map((h) => (
                  <div key={h.id} className="text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span className="font-semibold text-slate-800">{h.action}</span>
                      <span>{h.timestamp}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{h.notes}</p>
                    <span className="text-[10px] text-slate-400 font-medium">Actor ID: {h.actor}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setIsDetailOpen(false)} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
