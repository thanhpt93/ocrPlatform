import React, { useState } from 'react';
import {
  Building2,
  Users,
  Key,
  Shield,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { Modal } from '@/components/ui/modal';

export const SettingsPage: React.FC = () => {
  const { customers, activeCustomerId, updateCustomer, addCustomerMember } = usePlatformStore();
  const customer = customers.find((c) => c.id === activeCustomerId) || customers[0];

  const [activeTab, setActiveTab] = useState<string>('profile');

  // Org Profile state
  const [orgName, setOrgName] = useState(customer.orgName);
  const [email, setEmail] = useState(customer.email);
  const [phone, setPhone] = useState(customer.phone);
  const [address, setAddress] = useState(customer.address || '');
  const [taxId, setTaxId] = useState(customer.taxId || '');
  const [isSaved, setIsSaved] = useState(false);

  // Invite Member state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'Admin' | 'Developer' | 'Viewer'>('Developer');

  // API Credentials state
  const [apiKeys, setApiKeys] = useState([
    { id: 'key-prod-1', name: 'Production Backend Ingestion', token: 'live_sec_99a8b11c098df2410a82', created: '2026-01-01', lastUsed: '5 mins ago' },
    { id: 'key-dev-1', name: 'Staging Integration Sandbox', token: 'test_sec_7718aa00192bc9940121', created: '2026-02-14', lastUsed: 'Yesterday' },
  ]);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Security settings state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [ipWhitelist, setIpWhitelist] = useState('192.168.1.0/24\n10.240.0.0/16');

  const tabs = [
    { id: 'profile', label: 'Organization Profile' },
    { id: 'members', label: 'Member Management', count: customer.members?.length || 4 },
    { id: 'api', label: 'API Credentials', count: apiKeys.length },
    { id: 'security', label: 'Security & Compliance' },
  ];

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateCustomer(customer.id, {
      orgName,
      email,
      phone,
      address,
      taxId,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName || !memberEmail) return;
    addCustomerMember(customer.id, {
      name: memberName,
      email: memberEmail,
      role: memberRole,
    });
    setMemberName('');
    setMemberEmail('');
    setIsInviteOpen(false);
  };

  const handleCopyToken = (id: string, token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleGenerateKey = () => {
    const newKey = {
      id: `key-${Date.now()}`,
      name: `Generated Key ${apiKeys.length + 1}`,
      token: `live_sec_${Math.random().toString(36).substring(2, 12)}${Date.now().toString().slice(-4)}`,
      created: new Date().toISOString().split('T')[0],
      lastUsed: 'Never',
    };
    setApiKeys([newKey, ...apiKeys]);
  };

  const handleRevokeKey = (id: string) => {
    setApiKeys(apiKeys.filter((k) => k.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'Settings' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Organization Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage corporate identity, developer access tokens, and access security.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Organization Profile */}
      {activeTab === 'profile' && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Organization Information</CardTitle>
            <CardDescription>Primary business details displayed on invoices and tax certificates</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Legal Company Name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                />
                <Input
                  label="Corporate Tax ID / VAT Number"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="e.g. US-928174829"
                />
                <Input
                  label="Primary Billing Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="Contact Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <Textarea
                label="Registered Headquarters Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
              />

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {isSaved ? (
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Changes saved successfully!
                  </span>
                ) : (
                  <span />
                )}
                <Button type="submit" variant="primary" size="sm">
                  <Save className="h-4 w-4 mr-1" />
                  Save Organization Profile
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Member Management */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Team Members & Access Control</h2>
              <p className="text-xs text-slate-500">Assign role-based access for billing, developer APIs, or read-only auditing.</p>
            </div>
            <Button onClick={() => setIsInviteOpen(true)} variant="primary" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Invite Member
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Member Name</th>
                      <th className="py-3 px-4">Email Address</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Added Date</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customer.members?.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800">{m.name}</td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{m.email}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              m.role === 'Owner'
                                ? 'bg-purple-100 text-purple-700'
                                : m.role === 'Admin'
                                ? 'bg-blue-100 text-blue-700'
                                : m.role === 'Developer'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {m.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{m.addedDate}</td>
                        <td className="py-3 px-4">
                          <Badge variant="success" size="sm">Active</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: API Credentials */}
      {activeTab === 'api' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">API Access Tokens</h2>
              <p className="text-xs text-slate-500">Authenticate server-to-server OCR microservice endpoints.</p>
            </div>
            <Button onClick={handleGenerateKey} variant="primary" size="sm">
              <Key className="h-4 w-4 mr-1" />
              Generate API Key
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Key Label</th>
                      <th className="py-3 px-4">Secret Token</th>
                      <th className="py-3 px-4">Created Date</th>
                      <th className="py-3 px-4">Last Activity</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {apiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800">{k.name}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          <div className="inline-flex items-center gap-2 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <span>{k.token.slice(0, 10)}****************</span>
                            <button
                              onClick={() => handleCopyToken(k.id, k.token)}
                              className="text-slate-400 hover:text-blue-600 transition-colors"
                              title="Copy token"
                            >
                              {copiedKeyId === k.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{k.created}</td>
                        <td className="py-3 px-4 text-slate-500">{k.lastUsed}</td>
                        <td className="py-3 px-4 text-right">
                          <Button onClick={() => handleRevokeKey(k.id)} variant="ghost" size="xs" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-3 w-3 mr-1" />
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 4: Security */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication (2FA)</CardTitle>
              <CardDescription>Enforce hardware security key or TOTP authenticator app</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900">Enforce 2FA for all members</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Mandatory for Owner and Admin role sessions.</p>
                </div>
                <input
                  type="checkbox"
                  checked={twoFactorEnabled}
                  onChange={(e) => setTwoFactorEnabled(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                When enabled, team members must provide a one-time passcode generated by apps like Google Authenticator or 1Password.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>IP Whitelisting</CardTitle>
              <CardDescription>Restrict API requests to designated enterprise CIDR blocks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={ipWhitelist}
                onChange={(e) => setIpWhitelist(e.target.value)}
                rows={4}
                hint="Enter one CIDR subnet per line (e.g. 192.168.1.0/24)"
              />
              <Button onClick={() => alert('IP Whitelist rules updated')} variant="primary" size="sm" className="w-full">
                Apply CIDR Rules
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite New Organization Member"
        description="Send an invitation link with assigned permission roles"
      >
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="e.g. Jessica Taylor"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            required
          />
          <Input
            label="Work Email"
            type="email"
            placeholder="jessica@fincorp-global.com"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            required
          />
          <Select
            label="Access Role"
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value as any)}
          >
            <option value="Admin">Admin (Full administrative & billing control)</option>
            <option value="Developer">Developer (Manage API keys, inspect OCR jobs)</option>
            <option value="Viewer">Viewer (Read-only analytics and invoices)</option>
          </Select>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" onClick={() => setIsInviteOpen(false)} variant="outline" size="sm">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
