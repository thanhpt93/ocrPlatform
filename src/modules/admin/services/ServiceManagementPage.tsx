import React, { useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { OCRService, ProcessingMode, ServiceStatus } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { useTranslation } from '@/i18n';

export const ServiceManagementPage: React.FC = () => {
  const { t, dict } = useTranslation();
  const { services, docTypes, addService, updateService, deleteService } = usePlatformStore();

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<OCRService | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Financial');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [supportedFileFormats, setSupportedFileFormats] = useState('PDF, PNG, JPG, TIFF');
  const [supportedLanguages, setSupportedLanguages] = useState('English, Vietnamese');
  const [capabilities, setCapabilities] = useState('Table Extraction, Key-Value Pairs, Rotation Correction');
  const [supportedDocTypeIds, setSupportedDocTypeIds] = useState<string[]>([]);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('synchronous');
  const [displayOrder, setDisplayOrder] = useState(1);
  const [status, setStatus] = useState<ServiceStatus>('published');
  const [startingPrice, setStartingPrice] = useState(49);
  const [sla, setSla] = useState('99.9% Uptime');

  const categoriesMap = dict.common.categories as Record<string, string>;
  const modesMap = dict.common.processingModes as Record<string, string>;
  const statusesMap = dict.common.statuses as Record<string, string>;

  const filteredServices = services.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const handleOpenCreate = () => {
    setEditingService(null);
    setSubmitError(null);
    setCode(`OCR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
    setName('');
    setCategory('Financial');
    setDescription('');
    setThumbnail('https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80');
    setSupportedFileFormats('PDF, PNG, JPG');
    setSupportedLanguages('English, Vietnamese');
    setCapabilities('Text Detection, Layout Analysis');
    setSupportedDocTypeIds(docTypes[0]?.id ? [docTypes[0].id] : []);
    setProcessingMode('synchronous');
    setDisplayOrder(services.length + 1);
    setStatus('published');
    setStartingPrice(59);
    setSla('99.9% Uptime');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (srv: OCRService) => {
    setEditingService(srv);
    setSubmitError(null);
    setCode(srv.code);
    setName(srv.name);
    setCategory(srv.category);
    setDescription(srv.description);
    setThumbnail(srv.thumbnail);
    setSupportedFileFormats(srv.supportedFileFormats.join(', '));
    setSupportedLanguages(srv.supportedLanguages.join(', '));
    setCapabilities(srv.capabilities.join(', '));
    setSupportedDocTypeIds(srv.supportedDocTypeIds);
    setProcessingMode(srv.processingMode);
    setDisplayOrder(srv.displayOrder);
    setStatus(srv.status);
    setStartingPrice(srv.startingPrice);
    setSla(srv.sla);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    const servicePayload = {
      code,
      name,
      category,
      description,
      thumbnail,
      supportedFileFormats: supportedFileFormats.split(',').map((f) => f.trim()).filter(Boolean),
      supportedLanguages: supportedLanguages.split(',').map((l) => l.trim()).filter(Boolean),
      capabilities: capabilities.split(',').map((c) => c.trim()).filter(Boolean),
      supportedDocTypeIds,
      processingMode,
      displayOrder: Number(displayOrder),
      status,
      startingPrice: Number(startingPrice),
      sla,
    };

    try {
      if (editingService) {
        await updateService(editingService.id, servicePayload);
      } else {
        await addService(servicePayload);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save service');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDocTypeSelection = (id: string) => {
    if (supportedDocTypeIds.includes(id)) {
      setSupportedDocTypeIds(supportedDocTypeIds.filter((item) => item !== id));
    } else {
      setSupportedDocTypeIds([...supportedDocTypeIds, id]);
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
              { label: t('adminServices.breadcrumbCurrent') },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{t('adminServices.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('adminServices.subtitle')}</p>
        </div>
        <Button onClick={handleOpenCreate} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
          <Plus className="h-4 w-4 mr-1" />
          {t('adminServices.createBtn')}
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          {['all', 'published', 'draft', 'archived'].map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedStatus === st ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {statusesMap[st] || st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('adminServices.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Services Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">{t('adminServices.colOrder')}</th>
                  <th className="py-3 px-4">{t('adminServices.colService')}</th>
                  <th className="py-3 px-4">{t('adminServices.colCategory')}</th>
                  <th className="py-3 px-4">{t('adminServices.colMode')}</th>
                  <th className="py-3 px-4">{t('adminServices.colSupportedDocs')}</th>
                  <th className="py-3 px-4">{t('adminServices.colStartingPrice')}</th>
                  <th className="py-3 px-4">{t('common.status')}</th>
                  <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredServices.map((srv) => (
                  <tr key={srv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-400">{srv.displayOrder}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img src={srv.thumbnail} alt={srv.name} className="h-9 w-9 rounded-lg object-cover shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900">{srv.name}</div>
                          <div className="text-[11px] font-mono text-amber-600">{srv.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700">
                      {categoriesMap[srv.category] || srv.category}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {modesMap[srv.processingMode] || srv.processingMode}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {t('adminServices.docTypesCount', { count: srv.supportedDocTypeIds.length })}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {formatCurrency(srv.startingPrice)}{t('common.perMonth')}
                    </td>
                    <td className="py-3.5 px-4">
                      {srv.status === 'published' && <Badge variant="success">{t('common.statuses.published')}</Badge>}
                      {srv.status === 'draft' && <Badge variant="warning">{t('common.statuses.draft')}</Badge>}
                      {srv.status === 'archived' && <Badge variant="slate">{t('common.statuses.archived')}</Badge>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button onClick={() => handleOpenEdit(srv)} variant="outline" size="xs">
                          <Edit2 className="h-3 w-3 mr-1" /> {t('common.edit')}
                        </Button>
                        <Button
                          onClick={async () => {
                            if (confirm(t('adminServices.deleteConfirm', { name: srv.name }))) {
                              await deleteService(srv.id);
                            }
                          }}
                          variant="ghost"
                          size="xs"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Service Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingService
            ? t('adminServices.editTitle', { name: editingService.name })
            : t('adminServices.createTitle')
        }
        description={t('adminServices.modalDesc')}
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {submitError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('adminServices.codeLabel')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              hint="e.g. OCR-INV"
            />
            <Input
              label={t('adminServices.nameLabel')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Smart Invoice OCR"
            />
            <Select
              label={t('adminServices.categoryLabel')}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Financial">{t('common.categories.Financial')}</option>
              <option value="Legal">{t('common.categories.Legal')}</option>
              <option value="Identity">{t('common.categories.Identity')}</option>
              <option value="Structured Data">{t('common.categories.Structured Data')}</option>
              <option value="General">{t('common.categories.General')}</option>
            </Select>
            <Select
              label={t('adminServices.processingModeLabel')}
              value={processingMode}
              onChange={(e) => setProcessingMode(e.target.value as ProcessingMode)}
            >
              <option value="synchronous">{t('adminServices.modeSyncOption')}</option>
              <option value="asynchronous">{t('adminServices.modeAsyncOption')}</option>
              <option value="batch">{t('adminServices.modeBatchOption')}</option>
            </Select>
            <Input
              label={t('adminServices.startingPriceLabel')}
              type="number"
              value={startingPrice}
              onChange={(e) => setStartingPrice(Number(e.target.value))}
              required
            />
            <Select
              label={t('adminServices.publishingStatusLabel')}
              value={status}
              onChange={(e) => setStatus(e.target.value as ServiceStatus)}
            >
              <option value="published">{t('adminServices.statusPubOption')}</option>
              <option value="draft">{t('adminServices.statusDraftOption')}</option>
              <option value="archived">{t('adminServices.statusArchOption')}</option>
            </Select>
          </div>

          <Input
            label={t('adminServices.thumbnailLabel')}
            value={thumbnail}
            onChange={(e) => setThumbnail(e.target.value)}
            placeholder="https://..."
            required
          />

          <Textarea
            label={t('adminServices.shortDescLabel')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('adminServices.formatsLabel')}
              value={supportedFileFormats}
              onChange={(e) => setSupportedFileFormats(e.target.value)}
              hint="e.g. PDF, PNG, JPG, TIFF"
            />
            <Input
              label={t('adminServices.languagesLabel')}
              value={supportedLanguages}
              onChange={(e) => setSupportedLanguages(e.target.value)}
              hint="e.g. English, Vietnamese, Korean"
            />
          </div>

          <Input
            label={t('adminServices.capabilitiesLabel')}
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            hint="e.g. Table Extraction, Layout Analysis, Barcode Detection"
          />

          {/* Supported Document Types Multi-select Checkboxes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t('adminServices.associatedDocsLabel')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
              {docTypes.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={supportedDocTypeIds.includes(doc.id)}
                    onChange={() => toggleDocTypeSelection(doc.id)}
                    className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="truncate">{doc.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="outline" size="sm">
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
              {submitting ? t('common.saving') : editingService ? t('common.saveChanges') : t('adminServices.createSubmit')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
