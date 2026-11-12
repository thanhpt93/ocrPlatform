import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  RotateCw,
  Eye,
  Filter,
  FileCode,
  Download,
  Loader2,
  LogIn,
  Crop,
  Image as ImageIcon,
  Maximize2,
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
import { formatNumber, formatDateTime } from '@/utils/formatters';
import { ocrApi } from '@/services/api/endpoints';
import { api } from '@/services/api/client';

const FIELD_LABELS: Record<string, string> = {
  document_type: 'Loại giấy tờ (Document Type)',
  card_subtype: 'Phân loại thẻ (Card Subtype)',
  id_number: 'Số định danh / CCCD (ID Number)',
  passport_number: 'Số hộ chiếu (Passport No.)',
  passport_type: 'Loại hộ chiếu (Passport Type)',
  country_code: 'Mã quốc gia (Country Code)',
  license_number: 'Số GPLX (License No.)',
  license_class: 'Hạng bằng lái (Class)',
  full_name: 'Họ và tên (Full Name)',
  date_of_birth: 'Ngày sinh (Date of Birth)',
  gender: 'Giới tính (Gender)',
  nationality: 'Quốc tịch (Nationality)',
  origin_address: 'Quê quán (Place of Origin)',
  residence_address: 'Nơi thường trú / Cư trú (Residence)',
  place_of_birth: 'Nơi sinh (Place of Birth)',
  issue_date: 'Ngày cấp (Issue Date)',
  expiry_date: 'Có giá trị đến (Expiry Date)',
  issue_place: 'Nơi cấp (Place of Issue)',
  issue_authority: 'Cơ quan cấp (Issuing Authority)',
  id_card_number: 'Số CMND/CCCD gốc',
  mrz_line1: 'Dòng MRZ 1',
  mrz_line2: 'Dòng MRZ 2',
};

export const JobsPage: React.FC = () => {
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
        orgName: currentUser.company_name || currentUser.full_name || currentUser.email || 'My Organization',
      }
    : customers.find((c) => c.id === effectiveCustomerId) || customers[0];

  const customerJobs = jobs
    .map((j) => (j.status === 'processing' && j.extractedDataPreview ? { ...j, status: 'completed' as const } : j))
    .filter((j) => j.customerId === effectiveCustomerId);

  // Filter purchased services (from active licenses or active/expiring subscriptions)
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

  // Upload form state - Only select from purchased services, no page count input needed
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadServiceId, setUploadServiceId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      setUploadError('Yêu cầu xác thực: Vui lòng đăng nhập (Bearer JWT) hoặc cung cấp Header \'X-API-Key\'');
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

        const res = await ocrApi.processIdentity(formData);
        const nowStr = new Date().toLocaleString();
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
          docTypeName:
            res.detected_type === 'id_card'
              ? 'Căn cước công dân (CCCD)'
              : res.detected_type === 'passport'
              ? 'Hộ chiếu (Passport)'
              : res.detected_type === 'driver_license'
              ? 'Giấy phép lái xe (GPLX)'
              : 'Giấy tờ tùy thân',
          submissionTime: nowStr,
          completionTime: nowStr,
          pageCount: 1,
          processingDurationMs: res.execution_time_ms || 1200,
          confidenceScore: res.confidence_score || 99.2,
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
            : 'Lỗi khi kết nối hoặc xử lý bóc tách tài liệu với VLM.';
        setUploadError(String(errMsg));
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Fallback mock nếu người dùng chỉ nhập tên file mà không chọn file ảnh thật
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
        confidenceScore: 99.2,
        extractedDataPreview: {
          note: 'Mock execution (vui lòng chọn file ảnh thật để kích hoạt VLM Qwen2.5-VL)',
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
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'OCR Jobs' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">OCR Jobs & Processing</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor real-time document parsing status, inspect segmented ID images, and review structured OCR output.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => { setUploadError(null); setIsUploadOpen(true); }} variant="primary" size="sm">
            <UploadCloud className="h-4 w-4 mr-1.5" />
            Upload File for OCR
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
                placeholder="Search by Job ID, file name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                options={[{ value: 'all', label: 'All Services' }, ...filterServices.map((s) => ({ value: s.id, label: s.name }))]}
                className="w-full md:w-48 text-xs py-1.5"
              />
              <Select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'processing', label: 'Processing' },
                  { value: 'queued', label: 'Queued' },
                  { value: 'failed', label: 'Failed' },
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
              <CardTitle className="text-base font-semibold">Processed Documents ({filteredJobs.length})</CardTitle>
              <CardDescription className="text-xs">
                Historical record of API & UI document extraction requests.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Job ID</th>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">OCR Service</th>
                  <th className="py-3 px-4">Pages</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Submitted At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No OCR jobs found matching criteria.
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
                              {job.segmentationInfo?.detected && ' • ID Segmented'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <div>
                          <p className="font-medium">{job.serviceName}</p>
                          <p className="text-[10px] text-slate-400">{job.docTypeName}</p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {job.pageCount}
                      </td>
                      <td className="py-3.5 px-4">
                        {job.status === 'completed' && <Badge variant="success">Completed</Badge>}
                        {job.status === 'processing' && <Badge variant="info">Processing</Badge>}
                        {job.status === 'queued' && <Badge variant="warning">Queued</Badge>}
                        {job.status === 'failed' && <Badge variant="danger">Failed</Badge>}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {job.confidenceScore ? `${job.confidenceScore.toFixed(1)}%` : '—'}
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
                            title="Inspect Images & OCR Result"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                          {job.status === 'failed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetry(job.id)}
                              className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              title="Re-execute Job"
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
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
        title={`Chi tiết xử lý OCR: ${selectedJob?.id}`}
        description="Thông tin hình ảnh gốc, hình ảnh giấy tờ tùy thân đã tách nền & tự động xoay thẳng (Crop & Auto-Rotate ID) và kết quả bóc tách OCR"
        maxWidth="4xl"
      >
        {selectedJob && (
          <div className="space-y-5">
            {/* Top Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">Loại giấy tờ</span>
                <span className="text-xs font-semibold text-slate-800">{selectedJob.docTypeName}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">Định dạng & File</span>
                <span className="text-xs font-semibold text-slate-800 truncate block" title={selectedJob.fileName}>
                  {selectedJob.fileType} ({selectedJob.fileSize})
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">Độ tin cậy (Confidence)</span>
                <span className="text-xs font-semibold text-emerald-600 font-mono">
                  {selectedJob.confidenceScore ? `${selectedJob.confidenceScore.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">Thời gian xử lý</span>
                <span className="text-xs font-semibold text-slate-800 font-mono">
                  {selectedJob.processingDurationMs} ms
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium uppercase">Tách nền & Xoay thẳng</span>
                {selectedJob.segmentationInfo ? (
                  <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                    <Crop className="h-3.5 w-3.5" />
                    {selectedJob.segmentationInfo.detected
                      ? `Đã cắt (${Math.round((selectedJob.segmentationInfo.crop_area_ratio || 1) * 100)}%)`
                      : 'Ảnh sát viền'}
                    {selectedJob.segmentationInfo.rotation_applied_deg
                      ? ` • Xoay ${selectedJob.segmentationInfo.rotation_applied_deg}°`
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
                      <span className="text-xs font-semibold text-slate-800">1. Hình ảnh gốc (Original Image)</span>
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
                        {/* Visual Bounding Box Overlay */}
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
                      <span className="text-xs text-slate-400">Không có dữ liệu ảnh gốc</span>
                    )}
                  </div>
                  {selectedJob.segmentationInfo && (
                    <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Kích thước gốc: <strong className="font-mono text-slate-800">{selectedJob.segmentationInfo.original_dimensions || 'N/A'}</strong>
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
                      <span className="text-xs font-semibold text-blue-950">2. Hình ảnh ID đã Crop & Xoay thẳng</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setManualRotateDeg((prev) => (prev - 90 + 360) % 360)}
                        className="p-1 rounded bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="Xoay ngược chiều kim đồng hồ 90°"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualRotateDeg((prev) => (prev + 90) % 360)}
                        className="p-1 rounded bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="Xoay theo chiều kim đồng hồ 90°"
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
                      <span className="text-xs text-slate-400">Không có dữ liệu ảnh đã crop</span>
                    )}
                  </div>
                  {selectedJob.segmentationInfo && (
                    <div className="px-3.5 py-2 bg-blue-50/40 border-t border-blue-100 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Diện tích thẻ:{' '}
                        <strong className="font-mono text-blue-700">
                          {((selectedJob.segmentationInfo.crop_area_ratio || 1) * 100).toFixed(1)}%
                        </strong>
                        {selectedJob.segmentationInfo.rotation_applied_deg ? (
                          <span className="ml-1.5 text-emerald-700 font-semibold">
                            • Đã tự xoay thẳng ({selectedJob.segmentationInfo.rotation_applied_deg}°)
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        Method: {selectedJob.segmentationInfo.method}
                      </span>
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
                    3. Kết quả bóc tách thông tin OCR (Extracted Identity Fields)
                  </span>
                </div>
                <Badge variant="success" size="sm">Qwen2.5-VL Extracted</Badge>
              </div>

              {selectedJob.extractedDataPreview && typeof selectedJob.extractedDataPreview === 'object' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                  {Object.entries(selectedJob.extractedDataPreview)
                    .filter(([_, val]) => val !== null && val !== undefined && val !== '')
                    .map(([key, val]) => (
                      <div
                        key={key}
                        className={`bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs ${
                          key === 'residence_address' || key === 'origin_address' || key.startsWith('mrz_')
                            ? 'sm:col-span-2 lg:col-span-3'
                            : ''
                        }`}
                      >
                        <span className="block text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                          {FIELD_LABELS[key] || key.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 mt-0.5 block break-words font-mono">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">Raw Structured JSON Payload</span>
                  <Badge variant="slate" size="sm">application/json</Badge>
                </div>
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto max-h-56">
{JSON.stringify(
  {
    job_id: selectedJob.id,
    file_name: selectedJob.fileName,
    service: selectedJob.serviceName,
    document_type: selectedJob.docTypeId,
    confidence_score: selectedJob.confidenceScore || 99.4,
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
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => { if (!isProcessing) setIsUploadOpen(false); }}
        title="Execute OCR Job"
        description="Submit a document to test ID Segmentation & OCR pipeline extraction with Qwen2.5-VL 7B"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {!isAuthenticated && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900">Yêu cầu đăng nhập tài khoản</p>
                <p className="mt-0.5 text-slate-600 leading-relaxed">
                  Để gọi mô hình VLM bóc tách và trừ Quota bản quyền, bạn cần đăng nhập tài khoản khách hàng (ví dụ: <strong className="text-slate-800">thanhpt93.hd@gmail.com</strong>).
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => navigate('/login')}
                  className="mt-2.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  <LogIn className="h-3.5 w-3.5 mr-1" />
                  Đến trang Đăng nhập
                </Button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Document File</label>
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
                {fileName ? fileName : 'Click or drag image file here (CCCD, Hộ chiếu, GPLX)'}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Hỗ trợ tự động tách nền & xoay thẳng ID (JPG, PNG, WEBP)</p>
            </div>
            <Input
              type="text"
              value={fileName}
              disabled={isProcessing}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Or enter file name..."
              required
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">OCR Model / Service</label>
            {purchasedServices.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5\" />
                <div>
                  <p className="font-semibold">Chưa có dịch vụ OCR khả dụng</p>
                  <p className="mt-0.5 text-slate-600">
                    Bạn chưa có License hoặc Subscription đang hoạt động cho dịch vụ nào. Vui lòng mua gói cước hoặc kích hoạt License Key trước khi gửi tác vụ OCR.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <Select
                  value={uploadServiceId}
                  disabled={isProcessing}
                  onChange={(e) => setUploadServiceId(e.target.value)}
                  options={purchasedServices.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                  className="text-xs"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Chỉ hiển thị các dịch vụ OCR bạn đã mua và đang có bản quyền kích hoạt.
                </p>
              </div>
            )}
          </div>

          {isProcessing && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
              <span>Đang tự động tách nền, xoay thẳng thẻ ID và gửi sang VLM Qwen2.5-VL bóc tách... Vui lòng đợi trong giây lát.</span>
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
              {String(uploadError).toLowerCase().includes('xác thực') && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => navigate('/login')}
                  className="self-start text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
                >
                  <LogIn className="h-3.5 w-3.5 mr-1" />
                  Đăng nhập ngay
                </Button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button onClick={() => setIsUploadOpen(false)} variant="outline" size="sm" type="button" disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={purchasedServices.length === 0 || isProcessing || !isAuthenticated}
            >
              {isProcessing ? 'Processing...' : 'Submit Job'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
