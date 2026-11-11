import React, { useState, useEffect } from 'react';
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
  Trash2,
  Sparkles,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { licensesApi } from '@/services/api/endpoints';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/form-controls';
import { License } from '@/types';
import { formatDate, formatNumber } from '@/utils/formatters';

export const LicensesPage: React.FC = () => {
  const { licenses, activeCustomerId, currentUser, activateLicenseByKey, renewLicense, syncWithBackend } = usePlatformStore();

  useEffect(() => {
    syncWithBackend();
  }, []);

  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const customerLicenses = licenses.filter(
    (l) => l.customerId === effectiveCustomerId || (!currentUser && l.customerId === activeCustomerId)
  );

  const [search, setSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [inputLicenseKey, setInputLicenseKey] = useState('');
  const [activationFeedback, setActivationFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  // API Credentials state
  const [detailTab, setDetailTab] = useState<'overview' | 'credentials'>('overview');
  const [credentials, setCredentials] = useState<any[]>([]);
  const [newCredName, setNewCredName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [credLoading, setCredLoading] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);

  const filteredLicenses = customerLicenses.filter((l) => {
    return (
      l.id.toLowerCase().includes(search.toLowerCase()) ||
      l.serviceName.toLowerCase().includes(search.toLowerCase()) ||
      l.packageName.toLowerCase().includes(search.toLowerCase()) ||
      l.maskedKey.toLowerCase().includes(search.toLowerCase())
    );
  });

  const loadCredentials = async (licenseId: string) => {
    try {
      setCredLoading(true);
      const data = await licensesApi.getCredentials(licenseId);
      setCredentials(data || []);
    } catch (e: any) {
      console.warn('Could not load credentials from backend:', e);
    } finally {
      setCredLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLicense && detailTab === 'credentials') {
      loadCredentials(selectedLicense.id);
    }
  }, [selectedLicense, detailTab]);

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

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLicense || !newCredName.trim()) return;
    setCredError(null);
    setCredLoading(true);
    try {
      const res = await licensesApi.createCredential(selectedLicense.id, newCredName.trim());
      setGeneratedKey(res.api_key);
      setNewCredName('');
      await loadCredentials(selectedLicense.id);
    } catch (err: any) {
      setCredError(err?.message || 'Failed to generate credential');
    } finally {
      setCredLoading(false);
    }
  };

  const handleRevokeCredential = async (credId: string) => {
    if (!selectedLicense) return;
    try {
      await licensesApi.revokeCredential(selectedLicense.id, credId);
      await loadCredentials(selectedLicense.id);
    } catch (err: any) {
      console.error('Revoke failed:', err);
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
                              setDetailTab('overview');
                              setGeneratedKey(null);
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
          onClose={() => {
            setIsDetailOpen(false);
            setGeneratedKey(null);
          }}
          title={`License Details: ${selectedLicense.id}`}
          description="Cryptographic key parameters, API credentials, and authorization history"
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 text-xs font-semibold gap-4">
              <button
                onClick={() => setDetailTab('overview')}
                className={`pb-2 border-b-2 transition-colors ${
                  detailTab === 'overview'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Overview & History
              </button>
              <button
                onClick={() => setDetailTab('credentials')}
                className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                  detailTab === 'credentials'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Key className="h-3.5 w-3.5" />
                API Credentials
                {credentials.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full text-[10px]">
                    {credentials.length}
                  </span>
                )}
              </button>
            </div>

            {detailTab === 'overview' ? (
              <>
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
                  <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white max-h-48 overflow-y-auto">
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
              </>
            ) : (
              /* API Credentials Tab */
              <div className="space-y-4">
                {/* Generation Banner if newly created */}
                {generatedKey && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
                      <Sparkles className="h-4 w-4 text-emerald-600" />
                      <span>New API Secret Generated Successfully!</span>
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      Copy this secret immediately. For security, it will <strong>never be shown again</strong>:
                    </p>
                    <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-emerald-200 font-mono text-xs">
                      <span className="text-emerald-900 select-all font-bold break-all">{generatedKey}</span>
                      <button
                        onClick={() => handleCopyKey(generatedKey, 'new-api-key')}
                        className="ml-2 text-slate-500 hover:text-emerald-700"
                        title="Copy API Secret"
                      >
                        {copiedKey === 'new-api-key' ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Create Credential Form */}
                <form onSubmit={handleCreateCredential} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Credential Name (e.g. Production Backend Ingestion)"
                    value={newCredName}
                    onChange={(e) => setNewCredName(e.target.value)}
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                  <Button type="submit" disabled={credLoading} variant="primary" size="sm">
                    <PlusCircle className="h-3.5 w-3.5 mr-1" />
                    {credLoading ? 'Generating...' : 'Generate API Key'}
                  </Button>
                </form>

                {credError && (
                  <div className="p-2 bg-red-50 text-red-700 rounded-lg text-[11px] border border-red-200">
                    {credError}
                  </div>
                )}

                {/* Existing Credentials Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="py-2.5 px-3">Credential Name</th>
                        <th className="py-2.5 px-3">Masked Secret</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {credentials.length > 0 ? (
                        credentials.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-slate-800">{c.name}</td>
                            <td className="py-2 px-3 font-mono text-slate-600">{c.masked_key}</td>
                            <td className="py-2 px-3">
                              {c.status === 'active' ? (
                                <Badge variant="success" size="sm">Active</Badge>
                              ) : (
                                <Badge variant="danger" size="sm">Revoked</Badge>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {c.status === 'active' && (
                                <Button
                                  onClick={() => handleRevokeCredential(c.id)}
                                  variant="outline"
                                  size="xs"
                                  className="text-red-600 hover:bg-red-50 hover:border-red-300"
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Revoke
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            No API credentials created yet. Click Generate to issue your first developer key.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
