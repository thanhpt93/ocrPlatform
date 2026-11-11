import React, { useState } from 'react';
import {
  FileText,
  Search,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Eye,
  Filter,
  FileCode,
  Download,
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

export const JobsPage: React.FC = () => {
  const { jobs, activeCustomerId, customers, services, docTypes, retryJob, submitNewJob, currentUser } = usePlatformStore();
  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const customer = currentUser ? {
    id: currentUser.id,
    orgName: currentUser.company_name || currentUser.full_name || currentUser.email || 'My Organization',
  } : (customers.find((c) => c.id === effectiveCustomerId) || customers[0]);

  const customerJobs = jobs.filter((j) => j.customerId === effectiveCustomerId);

  const [search, setSearch] = useState('');
  const [selectedService, setSelectedService] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedJob, setSelectedJob] = useState<OCRJob | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // New mock upload form state
  const [fileName, setFileName] = useState('Corporate_Tax_Report_2026.pdf');
  const [uploadServiceId, setUploadServiceId] = useState(services[0]?.id || '');
  const [pageCount, setPageCount] = useState(3);

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
    setIsDetailOpen(true);
  };

  const handleRetry = (jobId: string) => {
    retryJob(jobId);
    if (selectedJob && selectedJob.id === jobId) {
      setSelectedJob({ ...selectedJob, status: 'completed', confidenceScore: 98.8 });
    }
  };

  const handleMockUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const srv = services.find((s) => s.id === uploadServiceId) || services[0];
    submitNewJob({
      customerId: customer.id,
      customerName: customer.orgName,
      fileName,
      fileSize: '2.4 MB',
      fileType: 'PDF',
      serviceId: srv ? srv.id : 'srv-1',
      serviceName: srv ? srv.name : 'OCR Service',
      docTypeId: 'doc-1',
      docTypeName: 'Standard VAT & Tax Invoice',
      pageCount: Number(pageCount),
      processingDurationMs: 1420,
      confidenceScore: 99.2,
      extractedDataPreview: {
        invoice_number: 'INV-2026-0981',
        total_amount: 1420.5,
        currency: 'USD',
      },
    });
    setIsUploadOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'OCR Jobs' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">OCR Jobs & Processing</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor real-time document parsing status, inspect structured extracted payloads, and replay failures.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsUploadOpen(true)} variant="primary" size="sm">
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
                options={[{ value: 'all', label: 'All Services' }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
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
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Job ID</th>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">OCR Service</th>
                  <th className="py-3 px-4">Document Type</th>
                  <th className="py-3 px-4 text-center">Pages</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Submitted At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-slate-500">
                      Chưa có tác vụ OCR nào cho tài khoản này. Sử dụng nút "Upload File for OCR" hoặc gọi API với License Key để thực thi.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-blue-600">{job.id}</td>
                      <td className="py-3 px-4 font-medium text-slate-900 truncate max-w-[200px]" title={job.fileName}>
                        {job.fileName}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{job.serviceName}</td>
                      <td className="py-3 px-4 text-slate-500">{job.docTypeName}</td>
                      <td className="py-3 px-4 text-center font-mono">{job.pageCount}</td>
                      <td className="py-3 px-4">
                        {job.status === 'completed' && <Badge variant="success">Completed</Badge>}
                        {job.status === 'processing' && <Badge variant="info">Processing</Badge>}
                        {job.status === 'queued' && <Badge variant="warning">Queued</Badge>}
                        {job.status === 'failed' && <Badge variant="danger">Failed</Badge>}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{job.submissionTime}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button onClick={() => handleOpenDetail(job)} variant="outline" size="xs">
                            <Eye className="h-3 w-3 mr-1" /> Inspect
                          </Button>
                          {job.status === 'failed' && (
                            <Button onClick={() => handleRetry(job.id)} variant="ghost" size="xs" className="text-amber-600 hover:text-amber-700">
                              <RotateCcw className="h-3 w-3" />
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

      {/* Inspect Job Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`OCR Job Details: ${selectedJob?.id}`}
        description="Execution trace, model metrics, and structured key-value payload"
      >
        {selectedJob && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">File:</span>
                <span className="font-semibold text-slate-800">{selectedJob.fileName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">OCR Engine:</span>
                <span className="font-semibold text-slate-800">{selectedJob.serviceName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Execution Time:</span>
                <span className="font-semibold text-slate-800">{selectedJob.processingDurationMs} ms</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Confidence Score:</span>
                <span className="font-semibold text-emerald-600">{selectedJob.confidenceScore || 99}%</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-800">Structured Payload Preview</span>
                <Badge variant="slate" size="sm">application/json</Badge>
              </div>
              <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto max-h-56">
{`{
  "job_id": "${selectedJob.id}",
  "file_name": "${selectedJob.fileName}",
  "service": "${selectedJob.serviceName}",
  "confidence": ${selectedJob.confidenceScore || 99.4},
  "status": "${selectedJob.status}",
  "metadata": {
    "pages": ${selectedJob.pageCount},
    "format": "${selectedJob.fileType}",
    "execution_time_ms": ${selectedJob.processingDurationMs}
  }
}`}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button onClick={() => setIsDetailOpen(false)} variant="outline" size="sm">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Mock Upload Modal */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Execute OCR Job"
        description="Submit a document to test OCR pipeline extraction"
      >
        <form onSubmit={handleMockUploadSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">File Name</label>
            <Input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              required
              className="text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">OCR Model / Service</label>
            <Select
              value={uploadServiceId}
              onChange={(e) => setUploadServiceId(e.target.value)}
              options={services.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
              className="text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Page Count</label>
            <Input
              type="number"
              min={1}
              max={50}
              value={pageCount}
              onChange={(e) => setPageCount(parseInt(e.target.value) || 1)}
              required
              className="text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button onClick={() => setIsUploadOpen(false)} variant="outline" size="sm" type="button">
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Submit Job
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
