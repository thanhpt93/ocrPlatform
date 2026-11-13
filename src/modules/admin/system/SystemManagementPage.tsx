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

export const SystemManagementPage: React.FC = () => {
  const { adminUsers, auditLogs, adminSystemConfig, createAdminOperator } = usePlatformStore();

  const [activeTab, setActiveTab] = useState('users');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tabs = [
    { id: 'users', label: 'Platform Administrators', count: adminUsers.length },
    { id: 'config', label: 'Runtime Configuration' },
    { id: 'audit', label: 'Security Audit Logs', count: auditLogs.length },
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
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'System Management' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">System & Governance</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real administrator accounts in database, active server configuration, and persisted audit logs.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Admin Staff */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Platform Administrators (PLATFORM_ADMIN)</h2>
              <p className="text-xs text-slate-500">Real staff accounts authenticated against the database.</p>
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
              Add Administrator
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Operator Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Created At</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {adminUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No administrator accounts loaded.
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
                            {u.createdAt ? new Date(u.createdAt).toLocaleString() : u.lastLogin}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={u.status === 'active' ? 'success' : 'danger'} size="sm" className="capitalize">
                              {u.status}
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
              <CardTitle>VLM & Inference Runtime Settings</CardTitle>
              <CardDescription>Live configuration loaded from backend environment (`settings`)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Ollama Base URL</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.ollama_base_url || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Default VLM Model</span>
                <span className="font-mono font-semibold text-amber-700">{adminSystemConfig?.ollama_model || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Context Window (num_ctx)</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.ollama_num_ctx ?? '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Max Output Tokens (num_predict)</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.ollama_num_predict ?? '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Ollama Request Timeout</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.ollama_timeout_seconds ?? '—'}s</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Max VLM Image Dimension</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.vlm_max_image_dimension ?? '—'} px</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Persistence & Auth Security Settings</CardTitle>
              <CardDescription>Active backend storage & JWT token lifetimes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Database Engine</span>
                <span className="font-mono font-semibold uppercase text-slate-900">{adminSystemConfig?.database_backend || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Access Token Lifetime</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.access_token_expire_minutes ?? '—'} minutes</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Refresh Token Lifetime</span>
                <span className="font-mono font-semibold text-slate-900">{adminSystemConfig?.refresh_token_expire_days ?? '—'} days</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: Audit Logs */}
      {activeTab === 'audit' && (
        <Card>
          <CardHeader>
            <CardTitle>Platform Audit Trails</CardTitle>
            <CardDescription>Real operational changes, registrations, and administrative events from database</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Resource</th>
                    <th className="py-3 px-4">IP Address</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        No audit log events recorded yet. Administrative actions and registrations will appear here automatically.
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
        title="Create Platform Administrator"
        description="Provision a real PLATFORM_ADMIN user account in the database"
      >
        <form onSubmit={handleCreateOperator} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <Input
            label="Full Name"
            placeholder="e.g. Operations Lead"
            value={newAdminName}
            onChange={(e) => setNewAdminName(e.target.value)}
            required
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="operator@ocrplatform.com"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            required
          />
          <Input
            label="Initial Password (min 6 characters)"
            type="password"
            minLength={6}
            value={newAdminPassword}
            onChange={(e) => setNewAdminPassword(e.target.value)}
            required
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" onClick={() => setIsInviteOpen(false)} variant="outline" size="sm">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              variant="primary"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
            >
              {submitting ? 'Creating...' : 'Create Administrator'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
