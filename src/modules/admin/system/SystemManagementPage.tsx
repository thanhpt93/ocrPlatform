import React, { useState } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { Modal } from '@/components/ui/modal';
import { useTranslation } from '@/i18n';

export const SystemManagementPage: React.FC = () => {
  const { t, dict, intlLocale } = useTranslation();
  const { adminUsers, auditLogs, adminSystemConfig, createAdminOperator } = usePlatformStore();

  const [activeTab, setActiveTab] = useState('users');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const statusesMap = dict.common.statuses as Record<string, string>;

  const tabs = [
    { id: 'users', label: t('adminSystem.tabUsers'), count: adminUsers.length },
    { id: 'config', label: t('adminSystem.tabConfig') },
    { id: 'audit', label: t('adminSystem.tabAudit'), count: auditLogs.length },
  ];

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      await createAdminOperator({
        full_name: newAdminName.trim(),
        email: newAdminEmail.trim(),
        password: newAdminPassword,
      });
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setIsInviteOpen(false);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create platform administrator');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: t('common.adminPortal'), path: '/admin/dashboard' },
              { label: t('adminSystem.breadcrumbCurrent') },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{t('adminSystem.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('adminSystem.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Admin Staff */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">{t('adminSystem.adminsHeading')}</h2>
              <p className="text-xs text-slate-500">{t('adminSystem.adminsSub')}</p>
            </div>
            <Button
              onClick={() => {
                setCreateError(null);
                setIsInviteOpen(true);
              }}
              variant="primary"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('adminSystem.addAdminBtn')}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">{t('adminSystem.colOperatorName')}</th>
                      <th className="py-3 px-4">{t('adminSystem.colEmail')}</th>
                      <th className="py-3 px-4">{t('adminSystem.colRole')}</th>
                      <th className="py-3 px-4">{t('adminSystem.colCreatedAt')}</th>
                      <th className="py-3 px-4">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {adminUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          {t('adminSystem.emptyAdmins')}
                        </td>
                      </tr>
                    ) : (
                      adminUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">{u.name}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {u.createdAt ? new Date(u.createdAt).toLocaleString(intlLocale) : u.lastLogin}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={u.status === 'active' ? 'success' : 'danger'} size="sm">
                              {statusesMap[u.status] || u.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Live Runtime Configuration */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>{t('adminSystem.vlmSettingsTitle')}</CardTitle>
              <CardDescription>{t('adminSystem.vlmSettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">{t('adminSystem.ollamaUrl')}</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.ollama_base_url || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">{t('adminSystem.defaultVlm')}</span>
                <span className="font-mono font-semibold text-amber-700">{adminSystemConfig?.ollama_model || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">{t('adminSystem.contextWindow')}</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.ollama_num_ctx ?? '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">{t('adminSystem.maxTokens')}</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.ollama_num_predict ?? '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">{t('adminSystem.requestTimeout')}</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.ollama_timeout_seconds ?? '—'}s</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{t('adminSystem.maxImageDim')}</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.vlm_max_image_dimension ?? '—'} px</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('adminSystem.securitySettingsTitle')}</CardTitle>
              <CardDescription>{t('adminSystem.securitySettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">{t('adminSystem.dbEngine')}</span>
                <span className="font-mono font-semibold uppercase text-slate-900">{adminSystemConfig?.database_backend || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">{t('adminSystem.accessLifetime')}</span>
                <span className="font-mono font-semibold text-slate-900">
                  {adminSystemConfig?.access_token_expire_minutes !== undefined
                    ? t('adminSystem.minutesUnit', { val: adminSystemConfig.access_token_expire_minutes })
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{t('adminSystem.refreshLifetime')}</span>
                <span className="font-mono font-semibold text-slate-900">
                  {adminSystemConfig?.refresh_token_expire_days !== undefined
                    ? t('adminSystem.daysUnit', { val: adminSystemConfig.refresh_token_expire_days })
                    : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: Audit Logs */}
      {activeTab === 'audit' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('adminSystem.auditTrailsTitle')}</CardTitle>
            <CardDescription>{t('adminSystem.auditTrailsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('adminSystem.colTimestamp')}</th>
                    <th className="py-3 px-4">{t('adminSystem.colActor')}</th>
                    <th className="py-3 px-4">{t('adminSystem.colAction')}</th>
                    <th className="py-3 px-4">{t('adminSystem.colResource')}</th>
                    <th className="py-3 px-4">{t('adminSystem.colIp')}</th>
                    <th className="py-3 px-4">{t('adminSystem.colDetails')}</th>
                    <th className="py-3 px-4">{t('adminSystem.colSeverity')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        {t('adminSystem.emptyAudit')}
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">{log.timestamp}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{log.actor}</div>
                          <div className="text-[11px] text-slate-400">{log.actorEmail}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium text-amber-700">{log.action}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{log.resourceType}:{log.resourceId}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">{log.ipAddress}</td>
                        <td className="py-3.5 px-4 text-slate-700 max-w-sm">{log.details}</td>
                        <td className="py-3.5 px-4">
                          {log.severity === 'info' && <Badge variant="default" size="sm">INFO</Badge>}
                          {log.severity === 'warning' && <Badge variant="warning" size="sm">WARN</Badge>}
                          {log.severity === 'critical' && <Badge variant="danger" size="sm">CRITICAL</Badge>}
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

      {/* Create Operator Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title={t('adminSystem.createAdminTitle')}
        description={t('adminSystem.createAdminDesc')}
      >
        <form onSubmit={handleCreateOperator} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <Input
            label={t('adminSystem.fullNameLabel')}
            placeholder="e.g. Operations Lead"
            value={newAdminName}
            onChange={(e) => setNewAdminName(e.target.value)}
            required
          />
          <Input
            label={t('adminSystem.emailLabel')}
            type="email"
            placeholder="operator@ocrplatform.com"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            required
          />
          <Input
            label={t('adminSystem.passwordLabel')}
            type="password"
            minLength={6}
            value={newAdminPassword}
            onChange={(e) => setNewAdminPassword(e.target.value)}
            required
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" onClick={() => setIsInviteOpen(false)} variant="outline" size="sm">
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              variant="primary"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
            >
              {submitting ? t('common.creating') : t('adminSystem.createAdminSubmit')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
