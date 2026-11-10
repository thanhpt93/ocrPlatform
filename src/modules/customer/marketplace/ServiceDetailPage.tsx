import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Globe,
  Clock,
  ShieldCheck,
  Star,
  Zap,
  Lock,
  Layers,
  Sparkles,
  CreditCard,
  FileText,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatNumber } from '@/utils/formatters';

export const ServiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { services, packages, docTypes, checkoutPackage } = usePlatformStore();

  const service = services.find((s) => s.id === id) || services[0];
  const servicePackages = packages.filter((p) => p.serviceId === service.id);
  const supportedDocs = docTypes.filter((d) => service.supportedDocTypeIds.includes(d.id));

  const [activeTab, setActiveTab] = useState<string>('pricing');
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Corporate Credit Card (Visa **** 9821)');
  const [checkoutResult, setCheckoutResult] = useState<any>(null);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'features', label: 'Features & Capabilities' },
    { id: 'documents', label: 'Supported Documents', count: supportedDocs.length },
    { id: 'pricing', label: 'Pricing & Packages', count: servicePackages.length },
  ];

  const handleStartCheckout = (pkg: any) => {
    setSelectedPackage(pkg);
    setCheckoutResult(null);
    setIsCheckoutOpen(true);
  };

  const handleConfirmCheckout = () => {
    if (!selectedPackage) return;
    try {
      const res = checkoutPackage({
        packageId: selectedPackage.id,
        paymentMethod,
      });
      setCheckoutResult(res);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumbs */}
      <div>
        <Breadcrumbs
          items={[
            { label: 'Customer Portal', path: '/app/dashboard' },
            { label: 'OCR Marketplace', path: '/app/marketplace' },
            { label: service.name },
          ]}
        />
        <div className="flex items-center gap-3 mt-2">
          <Button onClick={() => navigate('/app/marketplace')} variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Catalog
          </Button>
        </div>
      </div>

      {/* Hero Banner Card */}
      <Card className="overflow-hidden border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3">
          <div className="relative h-64 md:h-auto bg-slate-900 overflow-hidden">
            <img src={service.thumbnail} alt={service.name} className="h-full w-full object-cover opacity-85" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <Badge variant="info" size="sm" className="mb-2">
                {service.category}
              </Badge>
              <div className="text-xs font-mono text-slate-300">{service.code}</div>
              <div className="text-xs text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> {service.sla}
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 md:col-span-2 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Certified OCR Service
                </span>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  <span>{service.rating} / 5.0</span>
                  <span className="text-slate-400 font-normal">({service.reviewCount} reviews)</span>
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{service.name}</h1>
              <p className="text-xs md:text-sm text-slate-600 mt-2 leading-relaxed">
                {service.longDescription || service.description}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase block">Processing Mode</span>
                <span className="font-semibold text-slate-800 capitalize">{service.processingMode}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase block">Supported Formats</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {service.supportedFileFormats.join(', ')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase block">Languages</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {service.supportedLanguages.length} Languages
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase block">Starting Price</span>
                <span className="font-bold text-blue-600">{formatCurrency(service.startingPrice)}/mo</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Architecture & Technology Highlights</CardTitle>
              <CardDescription>Enterprise OCR pipeline and neural network stack</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-slate-700 leading-relaxed">
              <p>
                Our <strong>{service.name}</strong> incorporates state-of-the-art vision transformers and layout analysis
                networks to deliver industry-leading accuracy. Each document submitted undergoes pre-processing (deskew,
                denoise, contrast enhancement) before text detection and key-value pair semantic extraction.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-amber-500" /> High-Throughput Cluster
                  </h4>
                  <p className="text-slate-500">
                    Processes up to 500 pages per minute with distributed GPU inference workers.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-blue-500" /> Zero Data Retention (ZDR)
                  </h4>
                  <p className="text-slate-500">
                    Complies with HIPAA, GDPR, and SOC2. In-memory execution without storing customer files on disk.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Integration</CardTitle>
              <CardDescription>REST endpoint snippet</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900 text-slate-100 p-3.5 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed">
                <span className="text-emerald-400">POST</span> /v1/ocr/process<br />
                <span className="text-slate-400">Host:</span> api.ocrplatform.com<br />
                <span className="text-slate-400">X-OCR-License-Key:</span> YOUR_KEY<br />
                <span className="text-slate-400">Content-Type:</span> multipart/form-data
              </div>
              <Button
                onClick={() => setActiveTab('pricing')}
                variant="primary"
                size="sm"
                className="w-full mt-4"
              >
                View Packages to Subscribe
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Features & Capabilities */}
      {activeTab === 'features' && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Model Capabilities</CardTitle>
            <CardDescription>Built-in extraction layers and document intelligence features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {service.capabilities.map((cap, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-slate-900">{cap}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Continuous reinforcement learning model trained on over 5,000,000 ground truth document specimens.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Supported Documents */}
      {activeTab === 'documents' && (
        <Card>
          <CardHeader>
            <CardTitle>Supported Document Types</CardTitle>
            <CardDescription>Document categories natively recognized and extracted by this service</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {supportedDocs.map((doc) => (
                <div key={doc.id} className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-medium text-slate-400">{doc.code}</span>
                      <Badge variant="default" size="sm">{doc.category}</Badge>
                    </div>
                    <h4 className="font-semibold text-xs text-slate-900 mb-1">{doc.name}</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{doc.description}</p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-600 font-medium">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Fully Optimized
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Pricing & Packages */}
      {activeTab === 'pricing' && (
        <div className="space-y-4">
          <div className="text-center max-w-xl mx-auto py-2">
            <h2 className="text-xl font-bold text-slate-900">Choose the Right Plan for {service.name}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Select a quota package suited to your monthly workload. Instant license key generation on checkout.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {servicePackages.map((pkg) => {
              const isRecommended = pkg.recommended || pkg.tier === 'Professional';
              return (
                <Card
                  key={pkg.id}
                  className={`flex flex-col justify-between transition-all ${
                    isRecommended ? 'border-blue-600 shadow-md ring-2 ring-blue-600/20 relative' : 'border-slate-200'
                  }`}
                >
                  {isRecommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                      Most Popular
                    </div>
                  )}

                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{pkg.tier}</span>
                      <Badge variant="slate" size="sm">{pkg.duration}</Badge>
                    </div>

                    <div className="mt-2 mb-4">
                      <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {formatCurrency(pkg.price)}
                        <span className="text-xs font-normal text-slate-500">/{pkg.duration === 'monthly' ? 'mo' : 'yr'}</span>
                      </div>
                      <p className="text-xs text-blue-600 font-semibold mt-1">
                        {formatNumber(pkg.quotaAmount)} {pkg.quotaType}s included
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600">
                      {pkg.features.map((feat, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </div>
                      ))}
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>API Access: {pkg.apiAccess ? 'Included' : 'Not included'}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Batch Processing: {pkg.batchProcessing ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 pt-0">
                    <Button
                      onClick={() => handleStartCheckout(pkg)}
                      variant={isRecommended ? 'primary' : 'outline'}
                      className="w-full justify-center shadow-xs"
                    >
                      Subscribe & Activate
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Mock Checkout Modal */}
      <Modal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        title={checkoutResult ? 'Subscription Activated!' : 'Confirm Package Subscription'}
        description={
          checkoutResult
            ? 'Your license key and subscription have been provisioned successfully.'
            : `Review your order details for ${selectedPackage?.name}`
        }
        maxWidth="lg"
      >
        {!checkoutResult ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Service:</span>
                <span className="font-semibold text-slate-800">{service.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Package Tier:</span>
                <span className="font-semibold text-slate-800">{selectedPackage?.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Quota:</span>
                <span className="font-semibold text-blue-600">
                  {formatNumber(selectedPackage?.quotaAmount || 0)} {selectedPackage?.quotaType}s
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Billing Cycle:</span>
                <span className="font-semibold text-slate-800 capitalize">{selectedPackage?.duration}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
                <span>Total Due Now:</span>
                <span className="text-blue-600">{formatCurrency(selectedPackage?.price || 0)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Payment Method (Mock)
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-none"
              >
                <option value="Corporate Credit Card (Visa **** 9821)">Corporate Credit Card (Visa **** 9821)</option>
                <option value="Mastercard Business **** 4120">Mastercard Business **** 4120</option>
                <option value="Wire Transfer / ACH (Net 30)">Wire Transfer / ACH (Net 30)</option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
              <Sparkles className="h-4 w-4 text-blue-600 inline mr-1" />
              <strong>Instant Provisioning:</strong> A unique API license key will be issued immediately upon completing this order.
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <Button onClick={() => setIsCheckoutOpen(false)} variant="outline" size="sm">
                Cancel
              </Button>
              <Button onClick={handleConfirmCheckout} variant="primary" size="sm">
                Complete Order ({formatCurrency(selectedPackage?.price || 0)})
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-center py-2">
            <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Welcome to {selectedPackage?.name}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Order <span className="font-mono font-semibold text-slate-800">{checkoutResult.orderId}</span> completed.
              </p>
            </div>

            <div className="p-3 bg-slate-100 rounded-lg text-left text-xs font-mono space-y-1">
              <div>Subscription ID: <span className="text-blue-600 font-semibold">{checkoutResult.subscriptionId}</span></div>
              <div>License ID: <span className="text-emerald-600 font-semibold">{checkoutResult.licenseId}</span></div>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={() => navigate('/app/licenses')} variant="primary" size="sm">
                Go to My Licenses
              </Button>
              <Button onClick={() => navigate('/app/subscriptions')} variant="outline" size="sm">
                View Subscriptions
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
