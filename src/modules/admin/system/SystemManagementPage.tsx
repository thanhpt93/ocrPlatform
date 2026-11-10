import React, { useState } from 'react';
import {
  Sliders,
  Users,
  Shield,
  FileText,
  Search,
  Plus,
  Save,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form-controls';
import { Modal } from '@/components/ui/modal';

export const SystemManagementPage: React.FC = () => {
  const { adminUsers, auditLogs, resetAllData } = usePlatformStore();

  const [activeTab, setActiveTab] = useState('users');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'Super Admin' | 'Service Manager' | 'Operations' | 'Support Specialist'>('Operations');

  // System config state
  const [maxPayloadMb, setMaxPayloadMb] = useState(50);
  const [inferenceTimeoutSec, setInferenceTimeoutSec] = useState(60);
  const [defaultRateLimitRpm, setDefaultRateLimitRpm] = useState(120);
  const [isConfigSaved, setIsConfigSaved] = useState(false);

  const tabs = [
    { id: 'users', label: 'Admin Staff & Roles', count: adminUsers.length },
    { id: 'config', label: 'System Configuration' },
    { id: 'audit', label: 'Security Audit Logs', count: auditLogs.length },
  ];

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConfigSaved(true);
    setTimeout(() => setIsConfigSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'System Management' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">System & Governance</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Internal operators, role permissions, cluster parameters, and audit trails.
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
              <h2 className="text-sm font-bold text-slate-900">Platform Operators & Administrators</h2>
              <p className="text-xs text-slate-500">Staff accounts with elevated platform management access.</p>
            </div>
            <Button onClick={() => setIsInviteOpen(true)} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
              <Plus className="h-4 w-4 mr-1" />
              Add Operator
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Operator Name</th>
                      <th className="py-3 px-4">Internal Email</th>
                      <th className="py-3 px-4">Security Role</th>
                      <th className="py-3 px-4">Last Login</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {adminUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">{u.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              u.role === 'Super Admin'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{u.lastLogin}</td>
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

      {/* Tab 2: System Configuration */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Inference Engine Limits</CardTitle>
              <CardDescription>Global thresholds applied to incoming customer OCR requests</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
                <Input
                  label="Maximum Document Payload Size (MB)"
                  type="number"
                  value={maxPayloadMb}
                  onChange={(e) => setMaxPayloadMb(Number(e.target.value))}
                  hint="Files exceeding this limit will be rejected at API gateway"
                />

                <Input
                  label="Inference Timeout Threshold (Seconds)"
                  type="number"
                  value={inferenceTimeoutSec}
                  onChange={(e) => setInferenceTimeoutSec(Number(e.target.value))}
                  hint="Maximum execution duration per single document page"
                />

                <Input
                  label="Default Standard Rate Limit (Requests per Minute)"
                  type="number"
                  value={defaultRateLimitRpm}
                  onChange={(e) => setDefaultRateLimitRpm(Number(e.target.value))}
                  hint="Default API throttle rate for non-enterprise customer tokens"
                />

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  {isConfigSaved ? (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> Parameters applied!
                    </span>
                  ) : (
                    <div />
                  )}
                  <Button type="submit" variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
                    <Save className="h-4 w-4 mr-1" />
                    Save Configuration
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Development Sandbox Controls</CardTitle>
              <CardDescription>Reset mock session state to initial factory dataset</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Clears all local storage mutations and resets OCR services, document types, packages, customers,
                subscriptions, and licenses back to default baseline mock fixtures.
              </p>

              <div className="p-3.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold">Reset Mock Session</h4>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Useful for demoing the subscription checkout, license generation, and document processing flows from scratch.
                  </p>
                </div>
              </div>

              <Button
                onClick={() => {
                  if (confirm('Reset all mock platform data to defaults?')) {
                    resetAllData();
                    alert('Mock database reset to default baseline.');
                  }
                }}
                variant="outline"
                size="sm"
                className="w-full text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                Reset All Local Storage Fixtures
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: Audit Logs */}
      {activeTab === 'audit' && (
        <Card>
          <CardHeader>
            <CardTitle>Platform Audit Trails</CardTitle>
            <CardDescription>Immutable record of operational changes and security events</CardDescription>
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
                  {auditLogs.map((log) => (
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
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Operator Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Add Internal Platform Operator"
        description="Grant administrative credentials to an internal team member"
      >
        <div className="space-y-4">
          <Input
            label="Operator Full Name"
            placeholder="e.g. Samuel Green"
            value={newAdminName}
            onChange={(e) => setNewAdminName(e.target.value)}
            required
          />
          <Input
            label="Internal Work Email"
            type="email"
            placeholder="samuel.g@ocrplatform.internal"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            required
          />
          <Select
            label="Administrative Role"
            value={newAdminRole}
            onChange={(e) => setNewAdminRole(e.target.value as any)}
          >
            <option value="Super Admin">Super Admin (Unrestricted platform control)</option>
            <option value="Service Manager">Service Manager (Catalog & Pricing)</option>
            <option value="Operations">Operations (Workers, Queues & Retries)</option>
            <option value="Support Specialist">Support Specialist (Customer read/audit)</option>
          </Select>

          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setIsInviteOpen(false)} variant="outline" size="sm">
              Cancel
            </Button>
            <Button
              onClick={() => {
                alert(`Invitation sent to ${newAdminEmail}`);
                setIsInviteOpen(false);
              }}
              variant="primary"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
            >
              Issue Credentials
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
