import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Star,
  Zap,
  Lock,
  Sparkles,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import {
  useTranslation,
  localizeService,
  localizeDocType,
  localizePackage,
  localizeQuotaType,
  localizeCategory,
} from '@/i18n';

export const ServiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, dict } = useTranslation();
  const { services, packages, docTypes, checkoutPackage } = usePlatformStore();

  const service = services.find((s) => s.id === id) || services[0];
  if (!service) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-700">{t('marketplace.serviceNotFound')}</p>
          <Button onClick={() => navigate('/app/marketplace')} variant="outline" size="sm">
            {t('marketplace.backToMarketplace')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const locService = localizeService(service, dict);
  const servicePackages = packages
    .filter((p) => p.serviceId === service.id)
    .sort((a, b) => a.price - b.price);
  const supportedDocs = docTypes
    .filter((d) => service.supportedDocTypeIds.includes(d.id))
    .map((d) => localizeDocType(d, dict));

  const [activeTab, setActiveTab] = useState<string>('pricing');
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Corporate Credit Card (Visa **** 9821)');
  const [checkoutResult, setCheckoutResult] = useState<any>(null);

  const tabs = [
    { id: 'overview', label: t('marketplace.tabs.overview') },
    { id: 'features', label: t('marketplace.tabs.features') },
    { id: 'documents', label: t('marketplace.tabs.documents'), count: supportedDocs.length },
    { id: 'pricing', label: t('marketplace.tabs.pricing'), count: servicePackages.length },
  ];

  const handleStartCheckout = (pkg: any) => {
    setSelectedPackage(pkg);
    setCheckoutResult(null);
    setIsCheckoutOpen(true);
  };

  const handleConfirmCheckout = async () => {
    if (!selectedPackage) return;
    try {
      const res = await checkoutPackage({
        packageId: selectedPackage.id,
        paymentMethod,
      });
      setCheckoutResult(res);
    } catch (e) {
      console.error(e);
    }
  };

  const locSelectedPkg = selectedPackage ? localizePackage(selectedPackage, dict) : null;

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumbs */}
      <div>
        <Breadcrumbs
          items={[
            { label: t('common.customerPortal'), path: '/app/dashboard' },
            { label: t('marketplace.breadcrumbCurrent'), path: '/app/marketplace' },
            { label: locService.name },
          ]}
        />
        <div className="flex items-center gap-3 mt-2">
          <Button onClick={() => navigate('/app/marketplace')} variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('marketplace.backToCatalog')}
          </Button>
        </div>
      </div>

      {/* Hero Banner Card */}
      <Card className="overflow-hidden border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3">
          <div className="relative h-64 md:h-auto bg-slate-900 overflow-hidden">
            <img src={service.thumbnail} alt={locService.name} className="h-full w-full object-cover opacity-85" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <Badge variant="info" size="sm" className="mb-2">
                {localizeCategory(service.category, dict)}
              </Badge>
              <div className="text-xs font-mono text-slate-300">{service.code}</div>
              <div className="text-xs text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> {locService.sla}
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 md:col-span-2 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  {t('marketplace.certifiedService')}
                </span>
                {service.reviewCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    <span>{service.rating} / 5.0</span>
                    <span className="text-slate-400 font-normal">
                      {t('marketplace.reviewsCount', { count: service.reviewCount })}
                    </span>
                  </div>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{locService.name}</h1>
              <p className="text-xs md:text-sm text-slate-600 mt-2 leading-relaxed">
                {locService.longDescription || locService.description}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase block">{t('marketplace.processingMode')}</span>
                <span className="font-semibold text-slate-800 capitalize">
                  {t(`common.processingModes.${service.processingMode}`) || service.processingMode}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase block">{t('marketplace.supportedFormats')}</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {service.supportedFileFormats.join(', ')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase block">{t('marketplace.languagesLabel')}</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {t('marketplace.languagesCount', { count: service.supportedLanguages.length })}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase block">{t('marketplace.startingPrice')}</span>
                <span className="font-bold text-blue-600">{formatCurrency(service.startingPrice)}{t('common.perMonth')}</span>
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
              <CardTitle>{t('marketplace.overviewTitle')}</CardTitle>
              <CardDescription>{t('marketplace.overviewSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-slate-700 leading-relaxed">
              <p>{t('marketplace.overviewBody', { name: locService.name })}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-amber-500" /> {t('marketplace.pipelineCardTitle')}
                  </h4>
                  <p className="text-slate-500">
                    {t('marketplace.pipelineCardDesc')}
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-blue-500" /> {t('marketplace.ledgerCardTitle')}
                  </h4>
                  <p className="text-slate-500">
                    {t('marketplace.ledgerCardDesc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('marketplace.apiIntegrationTitle')}</CardTitle>
              <CardDescription>{t('marketplace.apiIntegrationDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900 text-slate-100 p-3.5 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed">
                <span className="text-emerald-400">POST</span> /api/v1/ocr/process-identity<br />
                <span className="text-slate-400">X-API-Key:</span> &lt;YOUR_API_KEY&gt;<br />
                <span className="text-slate-400">Content-Type:</span> multipart/form-data<br />
                <span className="text-slate-400">Field:</span> file=@cccd.jpg
              </div>
              <Button
                onClick={() => setActiveTab('pricing')}
                variant="primary"
                size="sm"
                className="w-full mt-4"
              >
                {t('marketplace.viewPackagesBtn')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Features & Capabilities */}
      {activeTab === 'features' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('marketplace.featuresTitle')}</CardTitle>
            <CardDescription>{t('marketplace.featuresDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {locService.capabilities.map((cap, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-slate-900">{cap}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      {t('marketplace.builtInFeatureNote', { name: locService.name })}
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
            <CardTitle>{t('marketplace.docsTitle')}</CardTitle>
            <CardDescription>{t('marketplace.docsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {supportedDocs.map((doc) => (
                <div key={doc.id} className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-medium text-slate-400">{doc.code}</span>
                      <Badge variant="default" size="sm">{localizeCategory(doc.category, dict)}</Badge>
                    </div>
                    <h4 className="font-semibold text-xs text-slate-900 mb-1">{doc.name}</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{doc.description}</p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-600 font-medium">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {t('marketplace.fullyOptimized')}
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
            <h2 className="text-xl font-bold text-slate-900">{t('marketplace.choosePlanTitle', { name: locService.name })}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {t('marketplace.choosePlanDesc')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {servicePackages.map((pkg) => {
              const locPkg = localizePackage(pkg, dict);
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
                      {t('marketplace.mostPopular')}
                    </div>
                  )}

                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {t(`common.tiers.${pkg.tier}`) || pkg.tier}
                      </span>
                      <Badge variant="slate" size="sm">{t(`common.durations.${pkg.duration}`) || pkg.duration}</Badge>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{locPkg.name}</h3>

                    <div className="mt-2 mb-4">
                      <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {formatCurrency(pkg.price)}
                        <span className="text-xs font-normal text-slate-500">
                          {pkg.duration === 'monthly' ? t('common.perMonth') : t('common.perYear')}
                        </span>
                      </div>
                      <p className="text-xs text-blue-600 font-semibold mt-1">
                        {t('marketplace.unitsIncluded', {
                          amount: formatNumber(pkg.quotaAmount),
                          type: localizeQuotaType(pkg.quotaType, dict),
                        })}
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600">
                      {locPkg.features.map((feat, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </div>
                      ))}
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>
                          {t('marketplace.apiAccessLabel', {
                            val: pkg.apiAccess ? t('marketplace.included') : t('marketplace.notIncluded'),
                          })}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>
                          {t('marketplace.batchLabel', {
                            val: pkg.batchProcessing ? t('marketplace.enabled') : t('marketplace.disabled'),
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 pt-0">
                    <Button
                      onClick={() => handleStartCheckout(pkg)}
                      variant={isRecommended ? 'primary' : 'outline'}
                      className="w-full justify-center shadow-xs"
                    >
                      {t('marketplace.subscribeActivate')}
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
        title={checkoutResult ? t('marketplace.checkoutSuccessTitle') : t('marketplace.checkoutConfirmTitle')}
        description={
          checkoutResult
            ? t('marketplace.checkoutSuccessDesc')
            : t('marketplace.checkoutConfirmDesc', { name: locSelectedPkg?.name || '' })
        }
        maxWidth="lg"
      >
        {!checkoutResult ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{t('marketplace.serviceLabel')}</span>
                <span className="font-semibold text-slate-800">{locService.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{t('marketplace.packageTierLabel')}</span>
                <span className="font-semibold text-slate-800">{locSelectedPkg?.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{t('marketplace.quotaLabel')}</span>
                <span className="font-semibold text-blue-600">
                  {formatNumber(selectedPackage?.quotaAmount || 0)} {localizeQuotaType(selectedPackage?.quotaType, dict)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{t('marketplace.billingCycleLabel')}</span>
                <span className="font-semibold text-slate-800 capitalize">
                  {selectedPackage?.duration ? t(`common.durations.${selectedPackage.duration}`) || selectedPackage.duration : ''}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
                <span>{t('marketplace.totalDueNow')}</span>
                <span className="text-blue-600">{formatCurrency(selectedPackage?.price || 0)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t('marketplace.paymentMethodLabel')}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-none"
              >
                <option value="Corporate Credit Card (Visa **** 9821)">{t('marketplace.paymentOptions.visa')}</option>
                <option value="Mastercard Business **** 4120">{t('marketplace.paymentOptions.mastercard')}</option>
                <option value="Wire Transfer / ACH (Net 30)">{t('marketplace.paymentOptions.wire')}</option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
              <Sparkles className="h-4 w-4 text-blue-600 inline mr-1" />
              {t('marketplace.instantProvisioning')}
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <Button onClick={() => setIsCheckoutOpen(false)} variant="outline" size="sm">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleConfirmCheckout} variant="primary" size="sm">
                {t('marketplace.completeOrder', { price: formatCurrency(selectedPackage?.price || 0) })}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-center py-2">
            <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {t('marketplace.welcomeToPackage', { name: locSelectedPkg?.name || '' })}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {t('marketplace.orderCompletedText', { orderId: checkoutResult.orderId })}
              </p>
            </div>

            <div className="p-3 bg-slate-100 rounded-lg text-left text-xs font-mono space-y-1">
              <div>{t('marketplace.subscriptionIdLabel')} <span className="text-blue-600 font-semibold">{checkoutResult.subscriptionId}</span></div>
              <div>{t('marketplace.licenseIdLabel')} <span className="text-emerald-600 font-semibold">{checkoutResult.licenseId}</span></div>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={() => navigate('/app/licenses')} variant="primary" size="sm">
                {t('marketplace.goToLicenses')}
              </Button>
              <Button onClick={() => navigate('/app/subscriptions')} variant="outline" size="sm">
                {t('marketplace.viewSubscriptions')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
