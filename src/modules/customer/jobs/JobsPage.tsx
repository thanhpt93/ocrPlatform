import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  UploadCloud,
  AlertTriangle,
  RotateCcw,
  RotateCw,
  Eye,
  Loader2,
  LogIn,
  Crop,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input, Select } from '@/components/ui/form-controls';
import { OCRJob } from '@/types';
import { ocrApi } from '@/services/api/endpoints';
import { api } from '@/services/api/client';
import { useTranslation, localizeServiceName } from '@/i18n';

export const JobsPage: React.FC = () => {
  const { t, dict, intlLocale } = useTranslation();
  const navigate = useNavigate();
  const {
    jobs,
    activeCustomerId,
    customers,
    services,
    docTypes,
    licenses,
    subscriptions,
    retryJob,
    submitNewJob,
    currentUser,
    syncWithBackend,
  } = usePlatformStore();

  useEffect(() => {
    syncWithBackend();
  }, []);

  const isAuthenticated = Boolean(api.getAccessToken());

  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const customer = currentUser
    ? {
        id: currentUser.id,
        orgName:
          currentUser.company_name ||
          currentUser.full_name ||
          currentUser.email ||
          t('common.myOrganization'),
      }
    : customers.find((c) => c.id === effectiveCustomerId) || customers[0];

  const getDocTypeDisplay = (docTypeId?: string, fallbackName?: string) => {
    if (docTypeId && docTypeId in dict.jobs.docTypes) {
      return dict.jobs.docTypes[docTypeId as keyof typeof dict.jobs.docTypes];
    }
    return fallbackName || dict.jobs.docTypes.identity_document;
  };

  const getFieldLabel = (key: string) => {
    const fieldMap = dict.jobs.fields as Record<string, string>;
    return fieldMap[key] || key.replace(/_/g, ' ');
  };

  const customerJobs = jobs
    .map((j) => (j.status === 'processing' && j.extractedDataPreview ? { ...j, status: 'completed' as const } : j))
    .filter((j) => j.customerId === effectiveCustomerId);

  const customerLicenses = licenses.filter(
    (l) =>
      (l.customerId === effectiveCustomerId || (!currentUser && l.customerId === activeCustomerId)) &&
      l.status === 'active'
  );
  const customerSubscriptions = subscriptions.filter(
    (s) => s.customerId === effectiveCustomerId && (s.status === 'active' || s.status === 'expiring')
  );

  const purchasedServiceIds = new Set<string>();
  const purchasedServiceNames = new Set<string>();

  customerLicenses.forEach((l) => {
    if (l.serviceId) purchasedServiceIds.add(l.serviceId);
    if (l.serviceName) purchasedServiceNames.add(l.serviceName.trim().toLowerCase());
  });
  customerSubscriptions.forEach((s) => {
    if (s.serviceId) purchasedServiceIds.add(s.serviceId);
    if (s.serviceName) purchasedServiceNames.add(s.serviceName.trim().toLowerCase());
  });

  const purchasedServices = services.filter(
    (s) => purchasedServiceIds.has(s.id) || purchasedServiceNames.has(s.name.trim().toLowerCase())
  );

  const [search, setSearch] = useState('');
  const [selectedService, setSelectedService] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedJob, setSelectedJob] = useState<OCRJob | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [manualRotateDeg, setManualRotateDeg] = useState<number>(0);

  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadServiceId, setUploadServiceId] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:3b');
  const [vlmHealth, setVlmHealth] = useState<{
    ollama_status: string;
    active_model: string;
    pipeline_mode?: string;
    hybrid_llm_model?: string;
    paddleocr_vl_model?: string;
    paddleocr_vl_ready?: boolean;
    rapidocr_ready?: boolean;
    installed_models?: string[];
    available_models?: Array<{
      name: string;
      label: string;
      vram_estimate: string;
      tier: string;
      mode?: string;
      installed: boolean;
    }>;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshJobs = async () => {
    setIsRefreshing(true);
    try {
      await syncWithBackend();
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    ocrApi.getHealth()
      .then((res) => {
        if (cancelled || !res) return;
        setVlmHealth(res);
        const installed = Array.isArray(res.installed_models) ? res.installed_models : [];
        const preferred = res.hybrid_llm_model || res.active_model;
        if (preferred && (installed.length === 0 || installed.includes(preferred))) {
          setSelectedModel(preferred);
        } else if (res.available_models?.length) {
          const match = res.available_models.find(
            (m: any) => m.installed && m.mode === 'hybrid'
          );
          if (match) setSelectedModel(match.name);
        }
      })
      .catch(() => {
        // Keep default fallback model list if backend health endpoint is unreachable
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (purchasedServices.length > 0) {
      if (!uploadServiceId || !purchasedServices.some((s) => s.id === uploadServiceId)) {
        setUploadServiceId(purchasedServices[0].id);
      }
    } else {
      setUploadServiceId('');
    }
  }, [purchasedServices, uploadServiceId]);

  const filteredJobs = customerJobs.filter((job) => {
    const matchesSearch =
      job.id.toLowerCase().includes(search.toLowerCase()) ||
      job.fileName.toLowerCase().includes(search.toLowerCase());
    const matchesService = selectedService === 'all' || job.serviceId === selectedService;
    const matchesStatus = selectedStatus === 'all' || job.status === selectedStatus;
    return matchesSearch && matchesService && matchesStatus;
  });

  const handleOpenDetail = (job: OCRJob) => {
    setSelectedJob(job);
    setManualRotateDeg(0);
    setIsDetailOpen(true);
  };

  const handleRetry = (jobId: string) => {
    retryJob(jobId);
    if (selectedJob && selectedJob.id === jobId) {
      setSelectedJob({ ...selectedJob, status: 'completed', confidenceScore: 98.8 });
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!isAuthenticated) {
      setUploadError(t('jobs.authErrorMsg'));
      return;
    }

    const srv = purchasedServices.find((s) => s.id === uploadServiceId) || purchasedServices[0];
    if (!srv) return;

    if (selectedFile) {
      setIsProcessing(true);
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const realLicenses = customerLicenses.filter((l) => l.id && !l.id.startsWith('lic-'));
        const matchingLic = realLicenses.find((l) => l.serviceId === srv.id) || realLicenses[0];
        if (matchingLic) {
          formData.append('license_id', matchingLic.id);
        }
        if (selectedModel) {
          formData.append('model_name', selectedModel);
        }

        const res = await ocrApi.processIdentity(formData);
        const nowStr = new Date().toLocaleString(intlLocale);
        const createdJob: OCRJob = {
          id: res.job_id || `JOB-${Date.now().toString().slice(-6)}`,
          customerId: customer.id,
          customerName: customer.orgName,
          fileName: selectedFile.name,
          fileSize: `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`,
          fileType: selectedFile.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMAGE',
          serviceId: srv.id,
          serviceName: srv.name,
          docTypeId: res.detected_type || 'identity_document',
          docTypeName: getDocTypeDisplay(res.detected_type),
          submissionTime: nowStr,
          completionTime: nowStr,
          pageCount: 1,
          processingDurationMs: res.execution_time_ms || 1200,
          confidenceScore: res.confidence_score ?? undefined,
          fieldConfidences: res.field_confidences || res.segmentation_info?.field_confidences || undefined,
          extractedDataPreview: res.extracted_data,
          originalImageUrl: res.original_image_url,
          croppedImageUrl: res.cropped_image_url,
          segmentationInfo: res.segmentation_info,
          status: 'completed',
        };

        submitNewJob(createdJob);

        await syncWithBackend();
        setIsUploadOpen(false);
        setSelectedFile(null);
        setFileName('');
        setSelectedJob(createdJob);
        setManualRotateDeg(0);
        setIsDetailOpen(true);
      } catch (err: any) {
        console.error('OCR process error:', err);
        const errMsg =
          typeof err?.message === 'string'
            ? err.message
            : typeof err?.message?.message === 'string'
            ? err.message.message
            : typeof err?.detail === 'string'
            ? err.detail
            : typeof err?.detail?.message === 'string'
            ? err.detail.message
            : t('jobs.ocrProcessError');
        setUploadError(String(errMsg));
      } finally {
        setIsProcessing(false);
      }
    } else {
      submitNewJob({
        customerId: customer.id,
        customerName: customer.orgName,
        fileName: fileName.trim() || 'Uploaded_Document.pdf',
        fileSize: '1.5 MB',
        fileType: fileName.toLowerCase().endsWith('.png') || fileName.toLowerCase().endsWith('.jpg') ? 'IMAGE' : 'PDF',
        serviceId: srv.id,
        serviceName: srv.name,
        docTypeId: srv.supportedDocTypeIds?.[0] || 'doc-1',
        docTypeName: docTypes.find((d) => d.id === srv.supportedDocTypeIds?.[0])?.name || 'Standard OCR Document',
        pageCount: 1,
        processingDurationMs: 1420,
        confidenceScore: 0,
        extractedDataPreview: {
          note: t('jobs.mockNote'),
          file: fileName,
        },
      });
      setIsUploadOpen(false);
      setFileName('');
    }
  };

  const filterServices = purchasedServices.length > 0 ? purchasedServices : services;

  const parseDimensions = (dimStr?: string): [number, number] | null => {
    if (!dimStr || !dimStr.includes('x')) return null;
    const parts = dimStr.split('x').map((n) => parseInt(n.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] > 0 && parts[1] > 0) {
      return [parts[0], parts[1]];
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: t('common.customerPortal'), path: '/app/dashboard' },
              { label: t('jobs.breadcrumbCurrent') },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{t('jobs.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('jobs.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleRefreshJobs}
            variant="outline"
            size="sm"
            disabled={isRefreshing}
          >
            <RotateCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? t('common.syncing') : t('common.refresh')}
          </Button>
          <Button onClick={() => { setUploadError(null); setIsUploadOpen(true); }} variant="primary" size="sm">
            <UploadCloud className="h-4 w-4 mr-1.5" />
            {t('jobs.uploadBtn')}
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('jobs.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                options={[
                  { value: 'all', label: t('jobs.allServices') },
                  ...filterServices.map((s) => ({ value: s.id, label: localizeServiceName(s.name, dict) })),
                ]}
                className="w-full md:w-48 text-xs py-1.5"
              />
              <Select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                options={[
                  { value: 'all', label: t('jobs.allStatuses') },
                  { value: 'completed', label: t('common.statuses.completed') },
                  { value: 'processing', label: t('common.statuses.processing') },
                  { value: 'queued', label: t('common.statuses.queued') },
                  { value: 'failed', label: t('common.statuses.failed') },
                ]}
                className="w-full md:w-36 text-xs py-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                {t('jobs.processedDocsTitle', { count: filteredJobs.length })}
              </CardTitle>
              <CardDescription className="text-xs">
                {t('jobs.processedDocsDesc')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">{t('jobs.colJobId')}</th>
                  <th className="py-3 px-4">{t('jobs.colFileName')}</th>
                  <th className="py-3 px-4">{t('jobs.colService')}</th>
                  <th className="py-3 px-4">{t('jobs.colPages')}</th>
                  <th className="py-3 px-4">{t('common.status')}</th>
                  <th className="py-3 px-4">{t('jobs.colConfidence')}</th>
                  <th className="py-3 px-4">{t('jobs.colSubmittedAt')}</th>
                  <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      {t('jobs.empty')}
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-blue-600">
                        {job.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {job.croppedImageUrl ? (
                            <img
                              src={job.croppedImageUrl}
                              alt={job.fileName}
                              className="h-8 w-12 object-cover rounded border border-slate-200 shrink-0 bg-slate-100"
                            />
                          ) : (
                            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                          )}
                          <div>
                            <span className="font-medium text-slate-800">{job.fileName}</span>
                            <span className="block text-[10px] text-slate-400">
                              {job.fileSize} • {job.fileType}
                              {job.segmentationInfo?.detected && ` • ${t('jobs.idSegmented')}`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <div>
                          <p className="font-medium">{localizeServiceName(job.serviceName, dict)}</p>
                          <p className="text-[10px] text-slate-400">
                            {getDocTypeDisplay(job.docTypeId, job.docTypeName)}
                          </p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {job.pageCount}
                      </td>
                      <td className="py-3.5 px-4">
                        {job.status === 'completed' && <Badge variant="success">{t('common.statuses.completed')}</Badge>}
                        {job.status === 'processing' && <Badge variant="info">{t('common.statuses.processing')}</Badge>}
                        {job.status === 'queued' && <Badge variant="warning">{t('common.statuses.queued')}</Badge>}
                        {job.status === 'failed' && <Badge variant="danger">{t('common.statuses.failed')}</Badge>}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {job.confidenceScore !== undefined && job.confidenceScore !== null ? `${job.confidenceScore.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {job.submissionTime}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetail(job)}
                            className="h-7 px-2 text-slate-600 hover:text-blue-600"
                            title={t('jobs.inspectTooltip')}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> {t('common.view')}
                          </Button>
                          {job.status === 'failed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetry(job.id)}
                              className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              title={t('jobs.retryTooltip')}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> {t('jobs.retryBtn')}
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

      {/* Inspect Payload & Segmentation Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={t('jobs.detailTitle', { id: selectedJob?.id || '' })}
        description={t('jobs.detailDesc')}
        maxWidth="4xl"
      >
        {selectedJob && (
          <div className="space-y-5">
            {/* Top Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">{t('jobs.metricDocType')}</span>
                <span className="text-xs font-semibold text-slate-800">
                  {getDocTypeDisplay(selectedJob.docTypeId, selectedJob.docTypeName)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">{t('jobs.metricFormatFile')}</span>
                <span className="text-xs font-semibold text-slate-800 truncate block" title={selectedJob.fileName}>
                  {selectedJob.fileType} ({selectedJob.fileSize})
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">{t('jobs.metricConfidence')}</span>
                <span className="text-xs font-semibold text-emerald-600 font-mono">
                  {selectedJob.confidenceScore !== undefined && selectedJob.confidenceScore !== null ? `${selectedJob.confidenceScore.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">{t('jobs.metricDuration')}</span>
                <span className="text-xs font-semibold text-slate-800 font-mono">
                  {selectedJob.processingDurationMs} ms
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">{t('jobs.metricSegmentation')}</span>
                {selectedJob.segmentationInfo ? (
                  <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                    <Crop className="h-3.5 w-3.5" />
                    {selectedJob.segmentationInfo.detected
                      ? t('jobs.croppedRatio', { pct: Math.round((selectedJob.segmentationInfo.crop_area_ratio || 1) * 100) })
                      : t('jobs.fullFrameEdge')}
                    {selectedJob.segmentationInfo.rotation_applied_deg
                      ? ` ${t('jobs.rotatedDeg', { deg: selectedJob.segmentationInfo.rotation_applied_deg })}`
                      : ''}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">—</span>
                )}
              </div>
            </div>

            {/* Section 1 & 2: Original Image & Cropped ID Image */}
            {(selectedJob.originalImageUrl || selectedJob.croppedImageUrl) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Original Image Card */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col">
                  <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-slate-600" />
                      <span className="text-xs font-semibold text-slate-800">{t('jobs.originalImageTitle')}</span>
                    </div>
                    {selectedJob.segmentationInfo?.original_dimensions && (
                      <Badge variant="slate" size="sm">
                        {selectedJob.segmentationInfo.original_dimensions} px
                      </Badge>
                    )}
                  </div>
                  <div className="p-3 bg-slate-900/95 flex-1 flex items-center justify-center min-h-[210px] max-h-[280px] relative overflow-hidden">
                    {selectedJob.originalImageUrl ? (
                      <div className="relative inline-block max-h-[250px] max-w-full">
                        <img
                          src={selectedJob.originalImageUrl}
                          alt="Original Uploaded Document"
                          className="max-h-[250px] w-auto object-contain rounded border border-slate-700"
                        />
                        {(() => {
                          const seg = selectedJob.segmentationInfo;
                          const origDims = parseDimensions(seg?.original_dimensions);
                          if (seg?.detected && seg.bbox && seg.bbox.length === 4 && origDims) {
                            const [origW, origH] = origDims;
                            const [xmin, ymin, xmax, ymax] = seg.bbox;
                            const leftPct = Math.max(0, Math.min(100, (xmin / origW) * 100));
                            const topPct = Math.max(0, Math.min(100, (ymin / origH) * 100));
                            const widthPct = Math.max(1, Math.min(100 - leftPct, ((xmax - xmin) / origW) * 100));
                            const heightPct = Math.max(1, Math.min(100 - topPct, ((ymax - ymin) / origH) * 100));
                            return (
                              <div
                                style={{
                                  left: `${leftPct}%`,
                                  top: `${topPct}%`,
                                  width: `${widthPct}%`,
                                  height: `${heightPct}%`,
                                }}
                                className="absolute border-2 border-emerald-400 bg-emerald-400/10 pointer-events-none rounded-sm shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                title={`Detected ID Region: [${xmin}, ${ymin}, ${xmax}, ${ymax}]`}
                              >
                                <span className="absolute -top-5 left-0 bg-emerald-500 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow">
                                  ID BBox
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">{t('jobs.noOriginalImage')}</span>
                    )}
                  </div>
                  {selectedJob.segmentationInfo && (
                    <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {t('jobs.originalDimensions')}{' '}
                        <strong className="font-mono text-slate-800">{selectedJob.segmentationInfo.original_dimensions || t('common.na')}</strong>
                      </span>
                      {selectedJob.segmentationInfo.bbox?.length === 4 && (
                        <span className="font-mono text-[10px] text-slate-500">
                          BBox: [{selectedJob.segmentationInfo.bbox.join(', ')}]
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Segmented / Cropped ID Image Card */}
                <div className="border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col">
                  <div className="px-3.5 py-2.5 bg-blue-50/70 border-b border-blue-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Crop className="h-4 w-4 text-blue-600" />
                      <span className="text-xs font-semibold text-blue-950">{t('jobs.croppedImageTitle')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setManualRotateDeg((prev) => (prev - 90 + 360) % 360)}
                        className="p-1 rounded bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                        title={t('jobs.rotateCCW')}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualRotateDeg((prev) => (prev + 90) % 360)}
                        className="p-1 rounded bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                        title={t('jobs.rotateCW')}
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                      {selectedJob.segmentationInfo?.cropped_dimensions && (
                        <Badge variant="info" size="sm">
                          {selectedJob.segmentationInfo.cropped_dimensions} px
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900/95 flex-1 flex items-center justify-center min-h-[210px] max-h-[280px] overflow-hidden">
                    {selectedJob.croppedImageUrl ? (
                      <img
                        src={selectedJob.croppedImageUrl}
                        alt="Cropped ID Card"
                        style={{
                          transform: manualRotateDeg ? `rotate(${manualRotateDeg}deg)` : undefined,
                          transition: 'transform 0.2s ease-in-out',
                        }}
                        className="max-h-[240px] max-w-[92%] w-auto object-contain rounded border-2 border-blue-400/80 shadow-lg"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">{t('jobs.noCroppedImage')}</span>
                    )}
                  </div>
                  {selectedJob.segmentationInfo && (
                    <div className="px-3.5 py-2 bg-blue-50/40 border-t border-blue-100 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {t('jobs.cardAreaRatio')}{' '}
                        <strong className="font-mono text-blue-700">
                          {((selectedJob.segmentationInfo.crop_area_ratio || 1) * 100).toFixed(1)}%
                        </strong>
                        {selectedJob.segmentationInfo.rotation_applied_deg ? (
                          <span className="ml-1.5 text-emerald-700 font-semibold">
                            {t('jobs.autoRotated', { deg: selectedJob.segmentationInfo.rotation_applied_deg })}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {t('jobs.methodLabel')} {selectedJob.segmentationInfo.method}
                        {selectedJob.segmentationInfo.pipeline_mode ? ` • ${selectedJob.segmentationInfo.pipeline_mode.toUpperCase()}` : ''}
                      </span>
                      {selectedJob.segmentationInfo.stage_timings_ms && Object.keys(selectedJob.segmentationInfo.stage_timings_ms).length > 0 && (
                        <div className="w-full pt-1 border-t border-blue-100/80 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-slate-600">
                          {selectedJob.segmentationInfo.stage_timings_ms.docaligner_ms !== undefined && (
                            <span>DocAligner: {Math.round(selectedJob.segmentationInfo.stage_timings_ms.docaligner_ms)}ms</span>
                          )}
                          {selectedJob.segmentationInfo.stage_timings_ms.text_det_ms !== undefined && (
                            <span>TextDet: {Math.round(selectedJob.segmentationInfo.stage_timings_ms.text_det_ms)}ms</span>
                          )}
                          {selectedJob.segmentationInfo.stage_timings_ms.paddleocr_vl_ms !== undefined && (
                            <span>
                              PaddleOCR-VL ({t('jobs.linesCount', { count: selectedJob.segmentationInfo.ocr_lines_count || 0 })}):{' '}
                              {Math.round(selectedJob.segmentationInfo.stage_timings_ms.paddleocr_vl_ms)}ms
                            </span>
                          )}
                          {selectedJob.segmentationInfo.stage_timings_ms.llm_map_ms !== undefined && (
                            <span>LLM Map: {Math.round(selectedJob.segmentationInfo.stage_timings_ms.llm_map_ms)}ms</span>
                          )}
                          {selectedJob.segmentationInfo.stage_timings_ms.vlm_ms !== undefined && (
                            <span>VLM: {Math.round(selectedJob.segmentationInfo.stage_timings_ms.vlm_ms)}ms</span>
                          )}
                          {selectedJob.segmentationInfo.ocr_confidence !== undefined && selectedJob.segmentationInfo.ocr_confidence !== null && (
                            <span>OCR Conf: {selectedJob.segmentationInfo.ocr_confidence.toFixed(1)}%</span>
                          )}
                          {selectedJob.segmentationInfo.llm_confidence !== undefined && selectedJob.segmentationInfo.llm_confidence !== null && (
                            <span>LLM Conf: {selectedJob.segmentationInfo.llm_confidence.toFixed(1)}%</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section 3: Extracted OCR Key-Value Fields & Raw JSON */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-900">
                    {t('jobs.extractedSectionTitle')}
                  </span>
                </div>
                <Badge variant="success" size="sm">{t('jobs.vlmExtractedBadge')}</Badge>
              </div>

              {selectedJob.extractedDataPreview && typeof selectedJob.extractedDataPreview === 'object' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                  {Object.entries(selectedJob.extractedDataPreview)
                    .filter(([_, val]) => val !== null && val !== undefined && val !== '')
                    .map(([key, val]) => {
                      const fieldConfMap = selectedJob.fieldConfidences || selectedJob.segmentationInfo?.field_confidences;
                      const fieldConf = fieldConfMap ? fieldConfMap[key] : undefined;
                      const confClass =
                        fieldConf === undefined
                          ? ''
                          : fieldConf >= 90
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : fieldConf >= 75
                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : 'text-rose-700 bg-rose-50 border-rose-200';
                      return (
                        <div
                          key={key}
                          className={`bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs ${
                            key === 'residence_address' ||
                            key === 'origin_address' ||
                            key === 'personal_identification' ||
                            key.startsWith('mrz_')
                              ? 'sm:col-span-2 lg:col-span-3'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="block text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                              {getFieldLabel(key)}
                            </span>
                            {fieldConf !== undefined && fieldConf !== null && (
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold shrink-0 ${confClass}`}>
                                {fieldConf.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-900 mt-0.5 block break-words font-mono">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">{t('jobs.rawJsonTitle')}</span>
                  <Badge variant="slate" size="sm">application/json</Badge>
                </div>
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto max-h-56">
{JSON.stringify(
  {
    job_id: selectedJob.id,
    file_name: selectedJob.fileName,
    service: selectedJob.serviceName,
    document_type: selectedJob.docTypeId,
    confidence_score: selectedJob.confidenceScore ?? null,
    field_confidences: selectedJob.fieldConfidences || selectedJob.segmentationInfo?.field_confidences || null,
    status: selectedJob.status,
    segmentation_info: selectedJob.segmentationInfo || null,
    extracted_data: selectedJob.extractedDataPreview || {},
  },
  null,
  2
)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button onClick={() => setIsDetailOpen(false)} variant="outline" size="sm">
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => { if (!isProcessing) setIsUploadOpen(false); }}
        title={t('jobs.uploadModalTitle')}
        description={t('jobs.uploadModalDesc')}
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {!isAuthenticated && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900">{t('jobs.authRequiredTitle')}</p>
                <p className="mt-0.5 text-slate-600 leading-relaxed">
                  {t('jobs.authRequiredDesc')}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => navigate('/login')}
                  className="mt-2.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  <LogIn className="h-3.5 w-3.5 mr-1" />
                  {t('jobs.goToLogin')}
                </Button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('jobs.documentFileLabel')}</label>
            <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-lg p-4 text-center cursor-pointer transition-colors bg-slate-50 relative mb-2">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                disabled={isProcessing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    setFileName(file.name);
                    setUploadError(null);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <UploadCloud className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
              <p className="text-xs font-medium text-slate-700">
                {fileName ? fileName : t('jobs.uploadDropzonePrompt')}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">{t('jobs.uploadDropzoneHint')}</p>
            </div>
            <Input
              type="text"
              value={fileName}
              disabled={isProcessing}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={t('jobs.fileNamePlaceholder')}
              required
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('jobs.serviceSelectLabel')}</label>
            {purchasedServices.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{t('jobs.noPurchasedTitle')}</p>
                  <p className="mt-0.5 text-slate-600">{t('jobs.noPurchasedDesc')}</p>
                </div>
              </div>
            ) : (
              <div>
                <Select
                  value={uploadServiceId}
                  disabled={isProcessing}
                  onChange={(e) => setUploadServiceId(e.target.value)}
                  options={purchasedServices.map((s) => ({ value: s.id, label: `${localizeServiceName(s.name, dict)} (${s.code})` }))}
                  className="text-xs"
                />
                <p className="text-[11px] text-slate-400 mt-1">{t('jobs.purchasedOnlyHint')}</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('jobs.pipelineLabel')}</label>
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium">
              {t('jobs.pipelineValue')}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">
                {t('jobs.llmModelLabel')}
              </label>
              {vlmHealth && (
                <span className={`text-[10px] font-medium ${vlmHealth.ollama_status === 'running' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  Ollama: {vlmHealth.ollama_status === 'running' ? t('adminMonitoring.online') : t('adminMonitoring.offline')}
                  <> • PaddleOCR-VL-Vi: {vlmHealth.paddleocr_vl_ready && vlmHealth.rapidocr_ready ? t('jobs.ready') : t('jobs.notInstalled')}</>
                </span>
              )}
            </div>
            <Select
              value={selectedModel}
              disabled={isProcessing}
              onChange={(e) => setSelectedModel(e.target.value)}
              options={
                (() => {
                  const filtered = (vlmHealth?.available_models || []).filter(
                    (m) => !m.mode || m.mode === 'hybrid'
                  );
                  if (filtered.length > 0) {
                    return filtered.map((m) => ({
                      value: m.name,
                      label: `${m.label} [${m.vram_estimate}]${m.installed ? ' ✓' : ''}`,
                    }));
                  }
                  return [
                    { value: 'qwen2.5:3b', label: t('jobs.recommendedModelFallback') },
                  ];
                })()
              }
              className="text-xs"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              {t('jobs.pipelineHintPrefix', { model: selectedModel })}
            </p>
          </div>

          {isProcessing && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
              <span>{t('jobs.processingBanner', { model: selectedModel })}</span>
            </div>
          )}

          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  {typeof uploadError === 'string' ? uploadError : JSON.stringify(uploadError)}
                </span>
              </div>
              {(!isAuthenticated || /xác thực|authentication|인증|401/i.test(String(uploadError))) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => navigate('/login')}
                  className="self-start text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
                >
                  <LogIn className="h-3.5 w-3.5 mr-1" />
                  {t('jobs.loginNow')}
                </Button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button onClick={() => setIsUploadOpen(false)} variant="outline" size="sm" type="button" disabled={isProcessing}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={purchasedServices.length === 0 || isProcessing || !isAuthenticated}
            >
              {isProcessing ? t('common.statuses.processing') : t('jobs.submitJob')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
