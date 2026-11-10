import React, { useState } from 'react';
import {
  FileCode,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { DocumentType, DocTypeCategory } from '@/types';

export const DocumentTypeManagementPage: React.FC = () => {
  const { docTypes, services, addDocType, updateDocType, deleteDocType } = usePlatformStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocType, setEditingDocType] = useState<DocumentType | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocTypeCategory>('Financial');
  const [exampleImage, setExampleImage] = useState('');
  const [supportedServiceIds, setSupportedServiceIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const categories = ['All', 'Financial', 'Legal', 'Identity', 'Logistics', 'Healthcare', 'General'];

  const filteredDocTypes = docTypes.filter((d) => {
    const matchesCategory = selectedCategory === 'All' || d.category === selectedCategory;
    const matchesSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleOpenCreate = () => {
    setEditingDocType(null);
    setCode(`DOC-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
    setName('');
    setDescription('');
    setCategory('Financial');
    setExampleImage('https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=300&q=80');
    setSupportedServiceIds([services[0]?.id || 'srv-1']);
    setStatus('active');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (doc: DocumentType) => {
    setEditingDocType(doc);
    setCode(doc.code);
    setName(doc.name);
    setDescription(doc.description);
    setCategory(doc.category);
    setExampleImage(doc.exampleImage || '');
    setSupportedServiceIds(doc.supportedServiceIds);
    setStatus(doc.status);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      code,
      name,
      description,
      category,
      exampleImage,
      supportedServiceIds,
      status,
    };

    if (editingDocType) {
      updateDocType(editingDocType.id, payload);
    } else {
      addDocType(payload);
    }
    setIsModalOpen(false);
  };

  const toggleServiceAssociation = (serviceId: string) => {
    if (supportedServiceIds.includes(serviceId)) {
      setSupportedServiceIds(supportedServiceIds.filter((id) => id !== serviceId));
    } else {
      setSupportedServiceIds([...supportedServiceIds, serviceId]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'Document Types' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Document Type Definitions</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage document schema taxonomy and associate documents with multiple OCR microservices.
          </p>
        </div>
        <Button onClick={handleOpenCreate} variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
          <Plus className="h-4 w-4 mr-1" />
          Create Document Type
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedCategory === cat ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search document types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Document Types Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Document Type Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Associated OCR Services</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocTypes.map((doc) => {
                  const associatedServices = services.filter((s) => doc.supportedServiceIds.includes(s.id));

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-amber-600">{doc.code}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{doc.name}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-sm">{doc.description}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="default" size="sm">{doc.category}</Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {associatedServices.map((s) => (
                            <span
                              key={s.id}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {doc.status === 'active' ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="slate">Inactive</Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button onClick={() => handleOpenEdit(doc)} variant="outline" size="xs">
                            <Edit2 className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button
                            onClick={() => {
                              if (confirm(`Delete document type ${doc.name}?`)) {
                                deleteDocType(doc.id);
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Document Type Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDocType ? `Edit Document Type: ${editingDocType.name}` : 'Create Document Type'}
        description="Define document taxonomy and multi-service routing"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Document Type Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              hint="e.g. DOC-TAX-INV"
            />
            <Select
              label="Document Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as DocTypeCategory)}
            >
              <option value="Financial">Financial</option>
              <option value="Legal">Legal</option>
              <option value="Identity">Identity</option>
              <option value="Logistics">Logistics</option>
              <option value="Healthcare">Healthcare</option>
              <option value="General">General</option>
            </Select>
          </div>

          <Input
            label="Document Type Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Standard VAT & Tax Invoice"
          />

          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            required
          />

          <Input
            label="Example Specimen Image URL"
            value={exampleImage}
            onChange={(e) => setExampleImage(e.target.value)}
            placeholder="https://..."
          />

          {/* Supported OCR Services Multi-select */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Supported by OCR Microservices (Multiple selection allowed)
            </label>
            <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={supportedServiceIds.includes(s.id)}
                    onChange={() => toggleServiceAssociation(s.id)}
                    className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="font-medium">{s.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({s.code})</span>
                </label>
              ))}
            </div>
          </div>

          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="active">Active (Available for API Routing)</option>
            <option value="inactive">Inactive</option>
          </Select>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="outline" size="sm">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
              {editingDocType ? 'Save Changes' : 'Create Document Type'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
