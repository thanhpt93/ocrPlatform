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
  const { jobs, activeCustomerId, customers, services, docTypes, retryJob, submitNewJob } = usePlatformStore();
  const customer = customers.find((c) => c.id === activeCustomerId) || customers[0];

  const customerJobs = jobs.filter((j) => j.customerId === customer.id);

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
      fileSize: `${(Math.random() * 3 + 1).toFixed(1)} MB`,
      fileType: fileName.split('.').pop()?.toUpperCase() || 'PDF',
      serviceId: srv.id,
      serviceName: srv.name,
      docTypeId: srv.supportedDocTypeIds[0] || 'doc-1',
      docTypeName: 'Scanned Document',
      pageCount: Number(pageCount),
      processingDurationMs: Math.floor(Math.random() * 2000 + 1000),
      confidenceScore: 99.1,
      extractedDataPreview: {
        documentType: srv.name,
        processedPages: pageCount,
        summary: `Successfully parsed ${fileName} with 99.1% optical accuracy.`,
        fieldsExtracted: 18,
      },
    });
    setIsUploadOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'OCR Jobs' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">OCR Processing Jobs</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit OCR batch operations, inspect extracted key-value schemas, and test new documents.
          </p>
        </div>
        <Button onClick={() => setIsUploadOpen(true)} variant="primary" size="sm">
          <UploadCloud className="h-4 w-4 mr-1 text-blue-200" />
          Test Document Upload
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {['all', 'completed', 'processing', 'queued', 'failed'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                  selectedStatus === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Service Filter */}
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All OCR Services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Job ID or file..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

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
                  <th className="py-3 px-4">Submitted At</th>
                  <th className="py-3 px-4">Pages</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredJobs.length > 0 ? (
                  filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-blue-600">{job.id}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 truncate max-w-[220px]" title={job.fileName}>
                          {job.fileName}
                        </div>
                        <div className="text-[10px] text-slate-400">{job.fileSize} • {job.fileType}</div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{job.serviceName}</td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">{job.submissionTime}</td>
                      <td className="py-3.5 px-4 text-slate-700 font-medium">{job.pageCount} pgs</td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                        {job.processingDurationMs > 0 ? `${(job.processingDurationMs / 1000).toFixed(2)}s` : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {job.status === 'completed' && (
                          <Badge variant="success">
                            Completed {job.confidenceScore ? `(${job.confidenceScore}%)` : ''}
                          </Badge>
                        )}
                        {job.status === 'processing' && <Badge variant="info">Processing</Badge>}
                        {job.status === 'queued' && <Badge variant="warning">Queued</Badge>}
                        {job.status === 'failed' && <Badge variant="danger">Failed</Badge>}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {job.status === 'failed' && (
                            <Button onClick={() => handleRetry(job.id)} variant="danger" size="xs">
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          )}
                          <Button onClick={() => handleOpenDetail(job)} variant="outline" size="xs">
                            <Eye className="h-3 w-3 mr-1" />
                            Inspect
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No OCR jobs found matching current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Job Detail & Extracted JSON Modal */}
      {selectedJob && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Job Inspection: ${selectedJob.id}`}
          description={`Processed by ${selectedJob.serviceName}`}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            {/* Metadata Summary */}
            <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block">File Name:</span>
                <span className="font-semibold text-slate-800 truncate block">{selectedJob.fileName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Pages Processed:</span>
                <span className="font-semibold text-slate-800">{selectedJob.pageCount} pages</span>
              </div>
              <div>
                <span className="text-slate-400 block">Confidence Score:</span>
                <span className="font-semibold text-emerald-600">
                  {selectedJob.confidenceScore ? `${selectedJob.confidenceScore}%` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Duration:</span>
                <span className="font-mono text-slate-800">
                  {selectedJob.processingDurationMs ? `${selectedJob.processingDurationMs} ms` : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Status:</span>
                <span className="capitalize font-semibold text-slate-800">{selectedJob.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Finished At:</span>
                <span className="font-mono text-slate-500">{selectedJob.completionTime || 'In progress'}</span>
              </div>
            </div>

            {/* Error Message if failed */}
            {selectedJob.status === 'failed' && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Error Reason:</p>
                  <p className="mt-0.5">{selectedJob.errorReason}</p>
                </div>
              </div>
            )}

            {/* Extracted JSON Payload */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <FileCode className="h-4 w-4 text-blue-600" /> Extracted Structured Payload (JSON)
                </span>
                <Button
                  onClick={() => alert('Downloaded structured JSON output')}
                  variant="ghost"
                  size="xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download JSON
                </Button>
              </div>
              <pre className="p-3.5 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-64 leading-relaxed border border-slate-800">
                {JSON.stringify(selectedJob.extractedDataPreview || { message: 'Inference pending' }, null, 2)}
              </pre>
            </div>

            <div className="flex justify-between items-center pt-2">
              {selectedJob.status === 'failed' ? (
                <Button onClick={() => handleRetry(selectedJob.id)} variant="danger" size="sm">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Retry Job Now
                </Button>
              ) : (
                <div />
              )}
              <Button onClick={() => setIsDetailOpen(false)} variant="primary" size="sm">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Mock Document Upload Modal */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Test Document OCR Processing"
        description="Simulate submitting an image or PDF to the OCR processing pipeline"
      >
        <form onSubmit={handleMockUploadSubmit} className="space-y-4">
          <Input
            label="File Name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            required
            hint="Supports .pdf, .png, .jpg, .tiff"
          />

          <Select
            label="Target OCR Microservice"
            value={uploadServiceId}
            onChange={(e) => setUploadServiceId(e.target.value)}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>

          <Input
            type="number"
            label="Page Count"
            value={pageCount}
            onChange={(e) => setPageCount(parseInt(e.target.value, 10))}
            min={1}
            max={50}
            required
          />

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <strong>Mock Execution:</strong> This test will register an instant completed OCR job and debit from your active quota.
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" onClick={() => setIsUploadOpen(false)} variant="outline" size="sm">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Submit Document for OCR
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
