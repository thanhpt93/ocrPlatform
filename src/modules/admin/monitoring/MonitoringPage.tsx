import React, { useState } from 'react';
import {
  Activity,
  Server,
  Cpu,
  KeyRound,
  Database,
  RefreshCw,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/common/StatCard';
import { formatNumber } from '@/utils/formatters';

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
};

export const MonitoringPage: React.FC = () => {
  const { adminMonitoring, adminUsageRecords, syncAdminData, adminLoading } = usePlatformStore();

  const [activeTab, setActiveTab] = useState('runtime');

  const loadedModels = adminMonitoring?.loaded_models || [];
  const installedModels = adminMonitoring?.installed_models || [];
  const usageStream = adminUsageRecords.length > 0 ? adminUsageRecords : (adminMonitoring?.recent_jobs || []);

  const tabs = [
    { id: 'runtime', label: 'VLM Runtime & Models', count: installedModels.length },
    { id: 'usageStream', label: 'Real OCR Usage Stream', count: usageStream.length },
  ];

  const ollamaOnline = adminMonitoring?.ollama_status === 'running';
  const dbOnline = adminMonitoring?.database_status === 'online';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'OCR Monitoring' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Live OCR Infrastructure & Usage</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time Ollama VLM engine status, VRAM-loaded models, database state, and actual recorded OCR runs.
          </p>
        </div>
        <Button onClick={() => syncAdminData()} disabled={adminLoading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${adminLoading ? 'animate-spin' : ''}`} />
          Refresh Telemetry
        </Button>
      </div>

      {/* Real Runtime Health Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Ollama VLM Engine"
          value={ollamaOnline ? 'Online' : 'Offline'}
          subtitle={adminMonitoring?.ollama_base_url || 'http://localhost:11434'}
          icon={<Cpu className="h-5 w-5" />}
          iconBgColor={ollamaOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}
        />
        <StatCard
          title="Database Engine"
          value={dbOnline ? 'Connected' : 'Error'}
          subtitle={`Dialect: ${(adminMonitoring?.database_dialect || 'sqlite').toUpperCase()}`}
          icon={<Database className="h-5 w-5" />}
          iconBgColor={dbOnline ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}
        />
        <StatCard
          title="Total Recorded Jobs"
          value={formatNumber(adminMonitoring?.total_jobs_processed ?? 0)}
          subtitle={`${formatNumber(adminMonitoring?.jobs_last_24h ?? 0)} in last 24h`}
          icon={<Activity className="h-5 w-5" />}
          iconBgColor="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Active Access Tokens"
          value={`${adminMonitoring?.active_licenses ?? 0} Licenses`}
          subtitle={`${adminMonitoring?.active_api_credentials ?? 0} active API keys`}
          icon={<KeyRound className="h-5 w-5" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: VLM Runtime & Models */}
      {activeTab === 'runtime' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-4 w-4 text-amber-600" />
                Active Ollama Configuration & Installed Models
              </CardTitle>
              <CardDescription>
                Default configured model: <span className="font-mono font-semibold text-slate-700">{adminMonitoring?.active_model || '—'}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Ollama Endpoint Status</span>
                <Badge variant={ollamaOnline ? 'success' : 'danger'} size="sm">
                  {adminMonitoring?.ollama_status || 'unknown'}
                </Badge>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mb-2">Locally Installed Models (/api/tags)</h4>
                {installedModels.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 text-center">
                    No models reported by Ollama.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {installedModels.map((modelName) => (
                      <div
                        key={modelName}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-slate-200 font-mono"
                      >
                        <span className="text-slate-800 font-medium">{modelName}</span>
                        {modelName === adminMonitoring?.active_model && (
                          <Badge variant="default" size="sm">Default</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-600" />
                Models Loaded in Memory (/api/ps)
              </CardTitle>
              <CardDescription>Live models currently resident in GPU VRAM / system RAM</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {loadedModels.length === 0 ? (
                <div className="p-6 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-center">
                  No VLM model is currently kept hot in VRAM (Ollama loads models on demand when an OCR request arrives).
                </div>
              ) : (
                loadedModels.map((m, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-900">{m.name || m.model}</span>
                      <Badge variant="success" size="sm">Loaded</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div>Total Size: <strong>{formatBytes(m.size)}</strong></div>
                      <div>VRAM Size: <strong className="text-emerald-700">{formatBytes(m.size_vram)}</strong></div>
                    </div>
                    {m.expires_at && (
                      <div className="text-[11px] text-slate-400">
                        Idle unload at: {new Date(m.expires_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Real OCR Usage Stream */}
      {activeTab === 'usageStream' && (
        <Card>
          <CardHeader>
            <CardTitle>Recorded OCR Inference Executions</CardTitle>
            <CardDescription>Real usage records persisted in the database after quota deduction</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Job ID</th>
                    <th className="py-3 px-4">Customer Account</th>
                    <th className="py-3 px-4">License Key</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Units</th>
                    <th className="py-3 px-4">Executed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usageStream.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        No OCR jobs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    usageStream.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono text-blue-600 font-medium">{rec.job_id || rec.id}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{rec.customer_name}</div>
                          <div className="text-[11px] text-slate-500">{rec.customer_email}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">{rec.masked_key || rec.license_id}</td>
                        <td className="py-3 px-4 text-slate-700">{rec.service_name || rec.service_id}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {rec.amount} {rec.quota_type}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                          {new Date(rec.created_at).toLocaleString()}
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
    </div>
  );
};
