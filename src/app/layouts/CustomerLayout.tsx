import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
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
  UserPlus,
  LogIn,
  LogOut,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/ui/modal';
import { api } from '@/services/api/client';
import { Button } from '@/components/ui/button';

export const CustomerLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customers, activeCustomerId, setActiveCustomerId, searchQuery, setSearchQuery, currentUser } = usePlatformStore();

  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  const effectiveCustomerId = currentUser?.id || activeCustomerId;
  const activeCustomer = currentUser ? {
    id: currentUser.id,
    orgName: currentUser.company_name || currentUser.full_name || currentUser.email || 'My Organization',
    tier: 'Standard',
  } : (customers.find((c) => c.id === effectiveCustomerId) || customers[0] || {
    id: 'demo',
    orgName: 'My Organization',
    tier: 'Standard',
  });

  const isAuthenticated = Boolean(api.getAccessToken());

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
                  Current Account
                </div>
                <div className="px-3 py-2 text-xs text-blue-400 font-medium bg-slate-700/50 flex items-center justify-between">
                  <span className="truncate">{activeCustomer.orgName}</span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                </div>
                {currentUser && (
                  <div className="p-1.5 border-t border-slate-700">
                    <button
                      onClick={() => {
                        setShowOrgDropdown(false);
                        navigate('/register');
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    >
                      + Register Another Account
                    </button>
                  </div>
                )}
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

        {/* Auth Quick Links in Sidebar if not authenticated */}
        {!isAuthenticated && (
          <div className="p-3 mx-3 mb-2 rounded-lg bg-blue-950/40 border border-blue-800/60">
            <p className="text-xs font-semibold text-blue-200 mb-1">Chưa đăng nhập?</p>
            <p className="text-[11px] text-slate-400 mb-2">Đăng ký hoặc đăng nhập để quản lý giấy phép OCR của bạn.</p>
            <div className="flex gap-2">
              <Button
                onClick={() => navigate('/login')}
                variant="outline"
                size="sm"
                className="flex-1 text-[11px] h-7 bg-slate-800 border-slate-700 text-slate-200"
              >
                <LogIn className="h-3 w-3 mr-1" />
                Đăng nhập
              </Button>
              <Button
                onClick={() => navigate('/register')}
                size="sm"
                className="flex-1 text-[11px] h-7 bg-blue-600 hover:bg-blue-500 text-white"
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Đăng ký
              </Button>
            </div>
          </div>
        )}

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

            {/* Top Bar Auth Buttons if unauthenticated */}
            {!isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => navigate('/login')}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 px-3 border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  <LogIn className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                  Đăng nhập
                </Button>
                <Button
                  onClick={() => navigate('/register')}
                  size="sm"
                  className="text-xs h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  Đăng ký tài khoản
                </Button>
              </div>
            ) : (
              /* User Profile Menu */
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center gap-2.5 p-1.5 pl-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center ring-2 ring-blue-100 shadow-xs">
                    {currentUser?.full_name ? currentUser.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'CU'}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-semibold text-slate-800 leading-tight">{currentUser?.full_name || 'Customer Account'}</div>
                    <div className="text-[10px] text-slate-500 leading-tight">{currentUser?.role || 'Customer'}</div>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
                </button>

                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-800">{currentUser?.full_name || 'Customer Account'}</p>
                      <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || 'customer@ocrplatform.io'}</p>
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
                      <NavLink
                        to="/register"
                        onClick={() => setShowProfileMenu(false)}
                        className="block px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium transition-colors"
                      >
                        + Đăng ký tài khoản khác
                      </NavLink>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          navigate('/admin/dashboard');
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-amber-600 hover:bg-amber-50 font-medium transition-colors"
                      >
                        Switch to Admin Portal
                      </button>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          api.clearTokens();
                          localStorage.removeItem('ocr_platform_state_v1');
                          usePlatformStore.setState({ currentUser: null });
                          navigate('/login');
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200/80 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-900">Platform Active</p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                All OCR microservice clusters and mock payment gateways are operational.
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Help & Support Modal */}
      <Modal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="Developer Guides & Support"
        description="Quick references for integrating OCR services with your application"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-slate-900 text-slate-300 font-mono text-xs">
            <p className="text-slate-400 mb-2"># Quick Start: Execute OCR with API Key</p>
            <p className="text-emerald-400">curl -X POST https://api.ocrplatform.io/v1/ocr/execute \</p>
            <p className="text-slate-300 pl-4">-H "X-OCR-API-KEY: YOUR_API_KEY" \</p>
            <p className="text-slate-300 pl-4">-F "file=@document.pdf"</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-800">Support Channels</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border border-slate-200">
                <span className="font-medium text-slate-700 block">Documentation</span>
                <span className="text-[11px] text-slate-500">docs.ocrplatform.io</span>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200">
                <span className="font-medium text-slate-700 block">Technical Support</span>
                <span className="text-[11px] text-slate-500">support@ocrplatform.io</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
