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
import { useTranslation } from '@/i18n';

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
};

export const MonitoringPage: React.FC = () => {
  const { t, intlLocale } = useTranslation();
  const { adminMonitoring, adminUsageRecords, syncAdminData, adminLoading } = usePlatformStore();

  const [activeTab, setActiveTab] = useState('runtime');

  const loadedModels = adminMonitoring?.loaded_models || [];
  const installedModels = adminMonitoring?.installed_models || [];
  const usageStream = adminUsageRecords.length > 0 ? adminUsageRecords : (adminMonitoring?.recent_jobs || []);

  const tabs = [
    { id: 'runtime', label: t('adminMonitoring.tabRuntime'), count: installedModels.length },
    { id: 'usageStream', label: t('adminMonitoring.tabUsageStream'), count: usageStream.length },
  ];

  const ollamaOnline = adminMonitoring?.ollama_status === 'running';
  const dbOnline = adminMonitoring?.database_status === 'online';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: t('common.adminPortal'), path: '/admin/dashboard' },
              { label: t('adminMonitoring.breadcrumbCurrent') },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{t('adminMonitoring.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('adminMonitoring.subtitle')}</p>
        </div>
        <Button onClick={() => syncAdminData()} disabled={adminLoading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${adminLoading ? 'animate-spin' : ''}`} />
          {t('adminMonitoring.refreshTelemetry')}
        </Button>
      </div>

      {/* Real Runtime Health Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('adminMonitoring.ollamaEngine')}
          value={ollamaOnline ? t('adminMonitoring.online') : t('adminMonitoring.offline')}
          subtitle={adminMonitoring?.ollama_base_url || 'http://localhost:11434'}
          icon={<Cpu className="h-5 w-5" />}
          iconBgColor={ollamaOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}
        />
        <StatCard
          title={t('adminMonitoring.dbEngine')}
          value={dbOnline ? t('adminMonitoring.connected') : t('adminMonitoring.error')}
          subtitle={t('adminMonitoring.dialectLabel', {
            dialect: (adminMonitoring?.database_dialect || 'sqlite').toUpperCase(),
          })}
          icon={<Database className="h-5 w-5" />}
          iconBgColor={dbOnline ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}
        />
        <StatCard
          title={t('adminMonitoring.totalRecordedJobs')}
          value={formatNumber(adminMonitoring?.total_jobs_processed ?? 0)}
          subtitle={t('adminMonitoring.last24h', {
            count: formatNumber(adminMonitoring?.jobs_last_24h ?? 0),
          })}
          icon={<Activity className="h-5 w-5" />}
          iconBgColor="bg-amber-50 text-amber-600"
        />
        <StatCard
          title={t('adminMonitoring.activeAccessTokens')}
          value={t('adminMonitoring.licensesVal', { count: adminMonitoring?.active_licenses ?? 0 })}
          subtitle={t('adminMonitoring.apiKeysVal', { count: adminMonitoring?.active_api_credentials ?? 0 })}
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
                {t('adminMonitoring.ollamaConfigTitle')}
              </CardTitle>
              <CardDescription>
                {t('adminMonitoring.defaultModelDesc')}{' '}
                <span className="font-mono font-semibold text-slate-700">{adminMonitoring?.active_model || '—'}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">{t('adminMonitoring.endpointStatus')}</span>
                <Badge variant={ollamaOnline ? 'success' : 'danger'} size="sm">
                  {ollamaOnline ? t('adminMonitoring.online') : adminMonitoring?.ollama_status || t('adminMonitoring.offline')}
                </Badge>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mb-2">{t('adminMonitoring.installedModelsTitle')}</h4>
                {installedModels.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 text-center">
                    {t('adminMonitoring.noModelsReported')}
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
                          <Badge variant="default" size="sm">{t('adminMonitoring.defaultBadge')}</Badge>
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
                {t('adminMonitoring.loadedModelsTitle')}
              </CardTitle>
              <CardDescription>{t('adminMonitoring.loadedModelsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {loadedModels.length === 0 ? (
                <div className="p-6 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-center">
                  {t('adminMonitoring.noLoadedModels')}
                </div>
              ) : (
                loadedModels.map((m, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-900">{m.name || m.model}</span>
                      <Badge variant="success" size="sm">{t('adminMonitoring.loadedBadge')}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div>{t('adminMonitoring.totalSize')} <strong>{formatBytes(m.size)}</strong></div>
                      <div>{t('adminMonitoring.vramSize')} <strong className="text-emerald-700">{formatBytes(m.size_vram)}</strong></div>
                    </div>
                    {m.expires_at && (
                      <div className="text-[11px] text-slate-400">
                        {t('adminMonitoring.idleUnload')} {new Date(m.expires_at).toLocaleString(intlLocale)}
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
            <CardTitle>{t('adminMonitoring.usageStreamTitle')}</CardTitle>
            <CardDescription>{t('adminMonitoring.usageStreamDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('adminMonitoring.colJobId')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colCustomer')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colLicenseKey')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colService')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colUnits')}</th>
                    <th className="py-3 px-4">{t('adminMonitoring.colExecutedAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usageStream.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        {t('adminMonitoring.emptyUsage')}
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
                          {new Date(rec.created_at).toLocaleString(intlLocale)}
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
