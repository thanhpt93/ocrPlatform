import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Store,
  CreditCard,
  Key,
  BarChart3,
  FileText,
  Receipt,
  Settings,
  Search,
  Bell,
  HelpCircle,
  Building2,
  ChevronDown,
  ShieldAlert,
  ArrowRightLeft,
  Sparkles,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export const CustomerLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customers, activeCustomerId, setActiveCustomerId, searchQuery, setSearchQuery } = usePlatformStore();

  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  const activeCustomer = customers.find((c) => c.id === activeCustomerId) || customers[0];

  const navItems = [
    { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
    { label: 'OCR Marketplace', path: '/app/marketplace', icon: Store, badge: 'New Services' },
    { label: 'My Subscriptions', path: '/app/subscriptions', icon: CreditCard },
    { label: 'My Licenses', path: '/app/licenses', icon: Key },
    { label: 'Usage & Analytics', path: '/app/usage', icon: BarChart3 },
    { label: 'OCR Jobs', path: '/app/jobs', icon: FileText },
    { label: 'Billing & Invoices', path: '/app/billing', icon: Receipt },
    { label: 'Settings', path: '/app/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Fixed Left Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none z-20">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                ocr<span className="text-blue-400">Platform</span>
              </span>
              <span className="text-[10px] text-slate-400 block -mt-1 font-medium tracking-wider uppercase">
                Customer Portal
              </span>
            </div>
          </div>
        </div>

        {/* Organization Switcher */}
        <div className="p-3 border-b border-slate-800/80">
          <div className="relative">
            <button
              onClick={() => setShowOrgDropdown(!showOrgDropdown)}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="h-7 w-7 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold text-slate-200 truncate">{activeCustomer.orgName}</div>
                  <div className="text-[10px] text-slate-400 truncate">{activeCustomer.tier} Tier</div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
            </button>

            {showOrgDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-1.5 z-50">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Switch Organization
                </div>
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveCustomerId(c.id);
                      setShowOrgDropdown(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-700 transition-colors',
                      c.id === activeCustomerId ? 'text-blue-400 font-medium bg-slate-700/50' : 'text-slate-300'
                    )}
                  >
                    <span className="truncate">{c.orgName}</span>
                    {c.id === activeCustomerId && <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all group',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && !isActive && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Portal Switcher Footer Banner */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <div className="p-3 rounded-lg bg-gradient-to-br from-slate-800/90 to-slate-800/40 border border-slate-700/60 text-slate-300">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 mb-1">
              <span>Platform Admin</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                Staff
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2.5 leading-relaxed">
              Manage OCR catalog, document types, customers & system ops.
            </p>
            <Button
              onClick={() => navigate('/admin/dashboard')}
              variant="outline"
              size="sm"
              className="w-full bg-slate-700/80 hover:bg-slate-700 border-slate-600 text-slate-200 justify-center text-xs h-8"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1 text-amber-400" />
              Go to Admin Portal
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Horizontal Top Navigation Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-xs">
          {/* Global Search Bar */}
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search OCR services, jobs, licenses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100 hover:bg-slate-100/80 focus:bg-white pl-9 pr-4 py-2 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-transparent focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Right Top Actions */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <button
              onClick={() => setShowNotificationModal(true)}
              className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white animate-pulse" />
            </button>

            {/* Help & Support */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Help & Guides"
            >
              <HelpCircle className="h-4 w-4" />
            </button>

            <div className="h-5 w-px bg-slate-200 mx-1" />

            {/* User Profile */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2.5 p-1.5 pl-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
              >
                <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center ring-2 ring-blue-100 shadow-xs">
                  AW
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-slate-800 leading-tight">Alexander Wright</div>
                  <div className="text-[10px] text-slate-500 leading-tight">Billing & Tech Owner</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-800">Alexander Wright</p>
                    <p className="text-[11px] text-slate-500 truncate">alex.wright@fincorp-global.com</p>
                  </div>
                  <div className="py-1">
                    <NavLink
                      to="/app/settings"
                      onClick={() => setShowProfileMenu(false)}
                      className="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Organization Profile & Members
                    </NavLink>
                    <NavLink
                      to="/app/billing"
                      onClick={() => setShowProfileMenu(false)}
                      className="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Billing & Invoices
                    </NavLink>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/admin/dashboard');
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium transition-colors"
                    >
                      Switch to Admin Portal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/70">
          <Outlet />
        </main>
      </div>

      {/* Notifications Modal */}
      <Modal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        title="Recent Platform Notifications"
        description="Real-time alerts, quota notifications, and license advisories"
      >
        <div className="space-y-3">
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200/80 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-900">License Quota Alert: Identity OCR</p>
              <p className="text-xs text-amber-700 mt-0.5">
                License LIC-8921-A2 has reached 82% of its 5,000 document allocation. Consider renewing or upgrading soon.
              </p>
              <span className="text-[10px] text-amber-600 font-medium mt-1.5 block">2 hours ago</span>
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200/80 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-900">Batch OCR Complete: 64 Invoices</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Job JOB-99208 finished processing with an average confidence score of 99.4%.
              </p>
              <span className="text-[10px] text-blue-600 font-medium mt-1.5 block">5 hours ago</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Help Modal */}
      <Modal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="ocrPlatform Help & Documentation"
        description="Quick guides to getting started with our OCR APIs and Marketplace"
      >
        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="p-3 rounded-lg bg-slate-100 border border-slate-200">
            <h4 className="font-semibold text-slate-800 mb-1">Quick Start Guide</h4>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Browse the <strong>OCR Marketplace</strong> to find models tailored to your document types.</li>
              <li>Select and subscribe to a Starter, Professional, or Enterprise package.</li>
              <li>Retrieve your <strong>License Key</strong> from the <em>My Licenses</em> tab.</li>
              <li>Include your License Key in your REST API headers: <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">X-OCR-License-Key: YOUR_KEY</code></li>
            </ol>
          </div>
          <p>
            Need technical assistance or custom document model training? Contact our 24/7 dedicated enterprise support team at{' '}
            <span className="text-blue-600 font-medium">support@ocrplatform.com</span>.
          </p>
        </div>
      </Modal>
    </div>
  );
};
