import React, { useState } from 'react';
import {
  Key,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Clock,
  PlusCircle,
  Eye,
  RefreshCw,
  Search,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/form-controls';
import { License } from '@/types';
import { formatDate, formatNumber } from '@/utils/formatters';

export const LicensesPage: React.FC = () => {
  const { licenses, activeCustomerId, activateLicenseByKey, renewLicense } = usePlatformStore();

  const customerLicenses = licenses.filter((l) => l.customerId === activeCustomerId);

  const [search, setSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [inputLicenseKey, setInputLicenseKey] = useState('');
  const [activationFeedback, setActivationFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  const filteredLicenses = customerLicenses.filter((l) => {
    return (
      l.id.toLowerCase().includes(search.toLowerCase()) ||
      l.serviceName.toLowerCase().includes(search.toLowerCase()) ||
      l.packageName.toLowerCase().includes(search.toLowerCase()) ||
      l.maskedKey.toLowerCase().includes(search.toLowerCase())
    );
  });

  const handleCopyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleActivateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputLicenseKey.trim()) return;
    const res = activateLicenseByKey(inputLicenseKey.trim());
    setActivationFeedback(res);
    if (res.success) {
      setInputLicenseKey('');
    }
  };

  const handleConfirmRenew = () => {
    if (selectedLicense) {
      renewLicense(selectedLicense.id, 6);
      setIsRenewModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'My Licenses' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">API Licenses & Keys</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage cryptographic license keys for API access and SDK on-premise integrations.
          </p>
        </div>
        <Button onClick={() => setIsActivateModalOpen(true)} variant="primary" size="sm">
          <Key className="h-4 w-4 mr-1 text-blue-200" />
          Activate New License Key
        </Button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search licenses by ID, service, or key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Total Licenses: <span className="font-bold text-slate-800">{customerLicenses.length}</span>
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
                  <th className="py-3 px-4">Masked Key</th>
                  <th className="py-3 px-4">OCR Service</th>
                  <th className="py-3 px-4">Package</th>
                  <th className="py-3 px-4">Issued Date</th>
                  <th className="py-3 px-4">Expiration Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLicenses.length > 0 ? (
                  filteredLicenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{lic.id}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        <div className="inline-flex items-center gap-2 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          <span>{lic.maskedKey}</span>
                          <button
                            onClick={() => handleCopyKey(lic.licenseKey, lic.id)}
                            className="text-slate-400 hover:text-blue-600 transition-colors"
                            title="Copy full key"
                          >
                            {copiedKey === lic.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{lic.serviceName}</td>
                      <td className="py-3.5 px-4 text-slate-600">{lic.packageName}</td>
                      <td className="py-3.5 px-4 text-slate-500">{formatDate(lic.startDate)}</td>
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
                            <Eye className="h-3 w-3 mr-1" />
                            Details
                          </Button>
                          <Button
                            onClick={() => {
                              setSelectedLicense(lic);
                              setIsRenewModalOpen(true);
                            }}
                            variant="secondary"
                            size="xs"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Renew
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No licenses found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* License Activation Modal */}
      <Modal
        isOpen={isActivateModalOpen}
        onClose={() => {
          setIsActivateModalOpen(false);
          setActivationFeedback(null);
        }}
        title="Activate OCR License Key"
        description="Enter the 25-character license token issued by your organization or vendor voucher"
      >
        <form onSubmit={handleActivateSubmit} className="space-y-4">
          <Input
            label="License Key"
            placeholder="e.g. OCR-FCG1-9982-A87F-B7100A921"
            value={inputLicenseKey}
            onChange={(e) => setInputLicenseKey(e.target.value)}
            required
            hint="Format: OCR-XXXX-XXXX-XXXX-XXXXXXXXX"
          />

          {activationFeedback && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                activationFeedback.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              {activationFeedback.message}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              onClick={() => {
                setIsActivateModalOpen(false);
                setActivationFeedback(null);
              }}
              variant="outline"
              size="sm"
            >
              Close
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Verify & Activate
            </Button>
          </div>
        </form>
      </Modal>

      {/* License Detail Modal */}
      {selectedLicense && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`License Details: ${selectedLicense.id}`}
          description="Cryptographic key parameters and authorization history"
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            {/* Full Key Box */}
            <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between font-mono">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Full License Key</span>
                <span className="text-emerald-400 font-semibold">{selectedLicense.licenseKey}</span>
              </div>
              <button
                onClick={() => handleCopyKey(selectedLicense.licenseKey, 'modal')}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Copy to clipboard"
              >
                {copiedKey === 'modal' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block">Bound Service:</span>
                <span className="font-semibold text-slate-800">{selectedLicense.serviceName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Package Tier:</span>
                <span className="font-semibold text-slate-800">{selectedLicense.packageName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Allocated Quota:</span>
                <span className="font-semibold text-blue-600">{formatNumber(selectedLicense.quota)} pages</span>
              </div>
              <div>
                <span className="text-slate-400 block">Quota Consumed:</span>
                <span className="font-semibold text-slate-800">{formatNumber(selectedLicense.usedQuota)} pages</span>
              </div>
              <div>
                <span className="text-slate-400 block">Active Since:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedLicense.startDate)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Valid Until:</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedLicense.expirationDate)}</span>
              </div>
            </div>

            {/* Audit History */}
            <div>
              <h4 className="font-bold text-slate-800 mb-2">License Lifecycle History</h4>
              <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white">
                {selectedLicense.history.map((h) => (
                  <div key={h.id} className="text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span className="font-semibold text-slate-700">{h.action}</span>
                      <span>{h.timestamp}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{h.notes}</p>
                    <span className="text-[10px] text-slate-400">Actor: {h.actor}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setIsDetailOpen(false)} variant="primary" size="sm">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Renew Modal */}
      {selectedLicense && (
        <Modal
          isOpen={isRenewModalOpen}
          onClose={() => setIsRenewModalOpen(false)}
          title="Extend License Validity"
          description={`Extend the expiration timestamp for ${selectedLicense.id}`}
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Extending this license will grant an additional <strong>6 months</strong> of validity to prevent service
              interruption across your connected production clusters.
            </p>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Expiration:</span>
                <span className="font-semibold">{formatDate(selectedLicense.expirationDate)}</span>
              </div>
              <div className="flex justify-between mt-1 text-emerald-600 font-semibold">
                <span>New Expiration:</span>
                <span>
                  {formatDate(
                    new Date(new Date(selectedLicense.expirationDate).setMonth(new Date(selectedLicense.expirationDate).getMonth() + 6)).toISOString()
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={() => setIsRenewModalOpen(false)} variant="outline" size="sm">
                Cancel
              </Button>
              <Button onClick={handleConfirmRenew} variant="primary" size="sm">
                Confirm Extension
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
