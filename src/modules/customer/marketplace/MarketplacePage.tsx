import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  CheckCircle2,
  FileCode2,
  Globe,
  Sparkles,
  ArrowRight,
  Star,
  FileCheck,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/formatters';

export const MarketplacePage: React.FC = () => {
  const navigate = useNavigate();
  const { services, docTypes, searchQuery } = usePlatformStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [localSearch, setLocalSearch] = useState<string>('');

  const categories = ['All', 'Financial', 'Legal', 'Identity', 'Structured Data', 'General'];

  // Filter services
  const query = (localSearch || searchQuery).toLowerCase();
  const filteredServices = services.filter((s) => {
    const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
    const matchesQuery =
      s.name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query) ||
      s.capabilities.some((c) => c.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Customer Portal', path: '/app/dashboard' }, { label: 'OCR Marketplace' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">OCR Service Marketplace</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Discover pre-trained AI OCR microservices tailored for specific document workflows.
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        {/* Categories */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors select-none ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Local Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search OCR models..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full bg-slate-50 pl-9 pr-4 py-1.5 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((service) => {
          // Resolve supported doc types names
          const supportedDocs = docTypes
            .filter((d) => service.supportedDocTypeIds.includes(d.id))
            .map((d) => d.name);

          return (
            <Card
              key={service.id}
              className="flex flex-col justify-between overflow-hidden hover:shadow-md hover:border-slate-300 transition-all group"
            >
              <div>
                {/* Thumbnail Image Header */}
                <div className="relative h-44 w-full overflow-hidden bg-slate-100">
                  <img
                    src={service.thumbnail}
                    alt={service.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3 flex gap-2">
                    <Badge variant="slate" size="sm" className="bg-slate-900/80 text-white border-transparent">
                      {service.category}
                    </Badge>
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/95 px-2 py-0.5 rounded-md text-xs font-semibold text-slate-800 shadow-xs">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span>{service.rating}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({service.reviewCount})</span>
                  </div>
                </div>

                {/* Content */}
                <CardContent className="p-5 pb-4 space-y-3.5">
                  <div>
                    <div className="text-[11px] font-mono font-medium text-blue-600 mb-0.5">{service.code}</div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-blue-600 transition-colors">
                      {service.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{service.description}</p>
                  </div>

                  {/* Capabilities Badges */}
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mb-1.5">
                      Key Capabilities
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {service.capabilities.slice(0, 3).map((cap, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100"
                        >
                          <CheckCircle2 className="h-3 w-3 text-blue-500" />
                          {cap}
                        </span>
                      ))}
                      {service.capabilities.length > 3 && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-500">
                          +{service.capabilities.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Supported Formats & Languages */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <FileCode2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{service.supportedFileFormats.join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{service.supportedLanguages.slice(0, 2).join(', ')}...</span>
                    </div>
                  </div>
                </CardContent>
              </div>

              {/* Bottom Footer Price & Action */}
              <div className="p-5 pt-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Starting from</span>
                  <div className="text-base font-bold text-slate-900">
                    {formatCurrency(service.startingPrice)}
                    <span className="text-xs font-normal text-slate-500">/mo</span>
                  </div>
                </div>
                <Button
                  onClick={() => navigate(`/app/marketplace/${service.id}`)}
                  variant="primary"
                  size="sm"
                  className="shadow-xs"
                >
                  View Details
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
