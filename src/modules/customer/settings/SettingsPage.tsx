import React, { useState } from 'react';
import {
  Plus,
  Copy,
  Check,
  Trash2,
  Save,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { Modal } from '@/components/ui/modal';
import { useTranslation } from '@/i18n';

export const SettingsPage: React.FC = () => {
  const { t, dict } = useTranslation();
  const { customers, activeCustomerId, updateCustomer, currentUser } = usePlatformStore();
  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const fallbackCustomer = customers.find((c) => c.id === effectiveCustomerId) || customers[0];
  const customer = currentUser
    ? {
        id: currentUser.id,
        orgName:
          currentUser.company_name ||
          currentUser.full_name ||
          currentUser.email ||
          t('common.myOrganization'),
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        address: '',
        taxId: '',
        tier: 'Standard',
        status: 'active',
        memberCount: 1,
        members: [
          {
            id: currentUser.id,
            name: currentUser.full_name || 'Owner',
            email: currentUser.email,
            role: 'Owner' as const,
            status: 'active' as const,
            addedDate: new Date().toISOString().split('T')[0],
          },
        ],
      }
    : fallbackCustomer || {
        id: '',
        orgName: '',
        email: '',
        phone: '',
        address: '',
        taxId: '',
        tier: 'Standard',
        status: 'active',
        memberCount: 0,
        members: [],
      };

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
  const [members, setMembers] = useState(customer.members || []);

  // API Credentials state
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name: string; token: string; created: string; lastUsed: string }>>([]);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Security settings state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [ipWhitelist, setIpWhitelist] = useState('');

  const tabs = [
    { id: 'profile', label: t('settings.tabProfile') },
    { id: 'members', label: t('settings.tabMembers'), count: members.length },
    { id: 'api', label: t('settings.tabApi'), count: apiKeys.length },
    { id: 'security', label: t('settings.tabSecurity') },
  ];

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (customer.id) {
      updateCustomer(customer.id, {
        orgName,
        email,
        phone,
        address,
        taxId,
      });
    }
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newMember = {
      id: `mem-${Date.now()}`,
      name: memberName,
      email: memberEmail,
      role: memberRole,
      status: 'invited' as const,
      addedDate: new Date().toISOString().split('T')[0],
    };
    const nextMembers = [...members, newMember];
    setMembers(nextMembers);
    if (customer.id) {
      updateCustomer(customer.id, {
        members: nextMembers,
        memberCount: nextMembers.length,
      });
    }
    setMemberName('');
    setMemberEmail('');
    setIsInviteOpen(false);
  };

  const handleCopyKey = (keyId: string, token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleDeleteKey = (keyId: string) => {
    setApiKeys(apiKeys.filter((k) => k.id !== keyId));
  };

  const statusesMap = dict.common.statuses as Record<string, string>;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: t('common.customerPortal'), path: '/app/dashboard' },
              { label: t('settings.breadcrumbCurrent') },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{t('settings.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('settings.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Profile & Display Language */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Language Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-600" />
                <CardTitle>{t('settings.languageCardTitle')}</CardTitle>
              </div>
              <CardDescription>{t('settings.languageCardDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <LanguageSwitcher variant="full" />
            </CardContent>
          </Card>

          {/* Organization Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.orgInfoTitle')}</CardTitle>
              <CardDescription>{t('settings.orgInfoDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isSaved && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {t('settings.savedSuccess')}
                </div>
              )}
              <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('settings.companyNameLabel')}
                  </label>
                  <Input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t('settings.billingEmailLabel')}
                    </label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t('settings.contactPhoneLabel')}
                    </label>
                    <Input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+84 912 345 678"
                      className="text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('settings.businessAddressLabel')}
                  </label>
                  <Input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t('settings.addressPlaceholder')}
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('settings.taxIdLabel')}
                  </label>
                  <Input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="e.g. 0102030405"
                    className="text-xs"
                  />
                </div>

                <div className="pt-2">
                  <Button type="submit" variant="primary" size="sm">
                    <Save className="h-3.5 w-3.5 mr-1.5" /> {t('common.saveChanges')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Members */}
      {activeTab === 'members' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>{t('settings.teamMembersTitle')}</CardTitle>
              <CardDescription>{t('settings.teamMembersDesc')}</CardDescription>
            </div>
            <Button onClick={() => setIsInviteOpen(true)} variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> {t('settings.inviteMember')}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('settings.colName')}</th>
                    <th className="py-3 px-4">{t('settings.colEmail')}</th>
                    <th className="py-3 px-4">{t('settings.colRole')}</th>
                    <th className="py-3 px-4">{t('common.status')}</th>
                    <th className="py-3 px-4">{t('settings.colAddedDate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{m.name}</td>
                      <td className="py-3.5 px-4 text-slate-600">{m.email}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {m.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="success" size="sm">
                          {statusesMap[m.status] || m.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">{m.addedDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: API Credentials */}
      {activeTab === 'api' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>{t('settings.apiCredsTitle')}</CardTitle>
              <CardDescription>{t('settings.apiCredsDesc')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('settings.colKeyLabel')}</th>
                    <th className="py-3 px-4">{t('settings.colSecretPreview')}</th>
                    <th className="py-3 px-4">{t('settings.colCreated')}</th>
                    <th className="py-3 px-4">{t('settings.colLastActivity')}</th>
                    <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        {t('settings.emptyApiKeysPrefix')}
                        <strong>{t('settings.emptyApiKeysHighlight')}</strong>
                        {t('settings.emptyApiKeysSuffix')}
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{k.name}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{k.token.slice(0, 10)}...</td>
                        <td className="py-3.5 px-4 text-slate-500">{k.created}</td>
                        <td className="py-3.5 px-4 text-slate-500">{k.lastUsed}</td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              onClick={() => handleCopyKey(k.id, k.token)}
                              variant="outline"
                              size="xs"
                            >
                              {copiedKeyId === k.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </Button>
                            <Button
                              onClick={() => handleDeleteKey(k.id)}
                              variant="ghost"
                              size="xs"
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
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
      )}

      {/* Tab 4: Security */}
      {activeTab === 'security' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.securityTitle')}</CardTitle>
            <CardDescription>{t('settings.securityDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-xl">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-xs font-semibold text-slate-800 block">{t('settings.enforce2faTitle')}</span>
                <span className="text-[11px] text-slate-500">{t('settings.enforce2faDesc')}</span>
              </div>
              <button
                onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  twoFactorEnabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    twoFactorEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('settings.ipWhitelistLabel')}
              </label>
              <Textarea
                rows={3}
                value={ipWhitelist}
                onChange={(e) => setIpWhitelist(e.target.value)}
                placeholder={t('settings.ipWhitelistPlaceholder')}
                className="font-mono text-xs"
              />
            </div>

            <div className="pt-2">
              <Button onClick={() => alert(t('settings.securitySavedAlert'))} variant="primary" size="sm">
                <Save className="h-3.5 w-3.5 mr-1.5" /> {t('settings.saveSecurity')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title={t('settings.inviteModalTitle')}
        description={t('settings.inviteModalDesc')}
      >
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('settings.memberNameLabel')}
            </label>
            <Input
              type="text"
              required
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="e.g. John Doe"
              className="text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('settings.workEmailLabel')}
            </label>
            <Input
              type="email"
              required
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="colleague@yourcompany.com"
              className="text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('settings.assignedRoleLabel')}
            </label>
            <Select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as any)}
              options={[
                { value: 'Admin', label: t('settings.roleAdmin') },
                { value: 'Developer', label: t('settings.roleDeveloper') },
                { value: 'Viewer', label: t('settings.roleViewer') },
              ]}
              className="text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button onClick={() => setIsInviteOpen(false)} variant="outline" size="sm" type="button">
              {t('common.cancel')}
            </Button>
            <Button variant="primary" size="sm" type="submit">
              {t('settings.sendInvite')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
