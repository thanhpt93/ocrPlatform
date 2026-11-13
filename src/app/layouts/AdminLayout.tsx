import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  FileCode,
  Package,
  Users,
  KeyRound,
  CreditCard,
  Activity,
  Sliders,
  Search,
  ArrowRightLeft,
  ChevronDown,
  ShieldCheck,
  Server,
  LogOut,
  LogIn,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { api } from '@/services/api/client';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    searchQuery,
    setSearchQuery,
    currentUser,
    adminMonitoring,
    adminLoading,
    adminError,
    syncAdminData,
  } = usePlatformStore();
  const [showAdminMenu, setShowAdminMenu] = useState(false);

  const isAdminAuthenticated = Boolean(api.getAccessToken() && currentUser?.role === 'PLATFORM_ADMIN');

  useEffect(() => {
    if (isAdminAuthenticated) {
      syncAdminData();
    }
  }, [isAdminAuthenticated, syncAdminData]);

  const navSections = [
    {
      title: 'Overview',
      items: [
        { label: 'Admin Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Service Catalog',
      items: [
        { label: 'OCR Services', path: '/admin/services', icon: Layers },
        { label: 'Document Types', path: '/admin/document-types', icon: FileCode },
      ],
    },
    {
      title: 'Monetization',
      items: [
        { label: 'Package Management', path: '/admin/packages', icon: Package },
        { label: 'Customers', path: '/admin/customers', icon: Users },
        { label: 'License Provisioning', path: '/admin/licenses', icon: KeyRound },
        { label: 'Orders & Billing', path: '/admin/billing', icon: CreditCard },
      ],
    },
    {
      title: 'Infrastructure & Ops',
      items: [
        { label: 'OCR Monitoring & Models', path: '/admin/monitoring', icon: Activity },
        { label: 'System Settings & Audit', path: '/admin/system', icon: Sliders },
      ],
    },
  ];

  const handleSignOut = () => {
    setShowAdminMenu(false);
    api.clearTokens();
    usePlatformStore.setState({
      currentUser: null,
      customers: [],
      subscriptions: [],
      licenses: [],
      orders: [],
      payments: [],
      adminUsers: [],
      auditLogs: [],
      adminDashboard: null,
      adminMonitoring: null,
      adminSystemConfig: null,
      adminUsageRecords: [],
    });
    navigate('/login');
  };

  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl space-y-4">
          <div className="inline-flex h-12 w-12 rounded-xl bg-amber-500/20 text-amber-400 items-center justify-center mx-auto border border-amber-500/30">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Platform Admin Authentication Required</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {currentUser
              ? `Signed in as ${currentUser.email} (${currentUser.role}). Administrator privileges (PLATFORM_ADMIN) are required to view real platform telemetry and customer records.`
              : 'Please sign in with your administrator account to access live platform metrics, real registered customers, and license controls.'}
          </p>
          <div className="flex gap-3 pt-2">
            {currentUser && (
              <Button
                onClick={() => navigate('/app/dashboard')}
                variant="outline"
                size="sm"
                className="flex-1 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
              >
                Customer Portal
              </Button>
            )}
            <Button
              onClick={() => navigate('/login')}
              variant="primary"
              size="sm"
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
            >
              <LogIn className="h-4 w-4 mr-1.5" />
              Sign In as Admin
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const adminName = currentUser?.full_name || currentUser?.email || 'Platform Admin';
  const adminInitials = adminName
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const ollamaRunning = adminMonitoring?.ollama_status === 'running';

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Fixed Admin Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col shrink-0 select-none z-20">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800 bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                ocr<span className="text-amber-400">Admin</span>
              </span>
              <span className="text-[10px] text-amber-300 block -mt-1 font-semibold tracking-wider uppercase">
                Platform Operations
              </span>
            </div>
          </div>
        </div>

        {/* Live Runtime Status Indicator */}
        <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              {ollamaRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={cn(
                  'relative inline-flex rounded-full h-2 w-2',
                  ollamaRunning ? 'bg-emerald-500' : 'bg-rose-500'
                )}
              />
            </span>
            <span className="text-[11px] font-medium text-slate-300 truncate">
              VLM: {ollamaRunning ? 'Ollama Online' : 'Ollama Offline'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[92px]" title={adminMonitoring?.active_model || ''}>
            {adminMonitoring?.installed_models ? `${adminMonitoring.installed_models.length} models` : '...'}
          </span>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {navSections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {section.title}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group',
                      isActive
                        ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20'
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
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Return to Customer Portal Footer */}
        <div className="p-3 border-t border-slate-800 bg-black/40">
          <Button
            onClick={() => navigate('/app/dashboard')}
            variant="outline"
            size="sm"
            className="w-full bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 justify-center text-xs h-9"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
            Switch to Customer Portal
          </Button>
        </div>
      </aside>

      {/* Main Admin Content Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navigation */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-xs">
          {/* Global Search Bar */}
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search customers, services, packages, licenses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100 hover:bg-slate-100/80 focus:bg-white pl-9 pr-4 py-2 rounded-lg text-xs text-slate-800 placeholder-slate-400 border border-transparent focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
              />
            </div>
          </div>

          {/* Right Top Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => syncAdminData()}
              variant="outline"
              size="xs"
              disabled={adminLoading}
              title="Refresh live data from backend"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', adminLoading && 'animate-spin')} />
              {adminLoading ? 'Syncing...' : 'Sync Live Data'}
            </Button>

            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
              <Server className="h-3.5 w-3.5 text-amber-600" />
              {adminMonitoring?.database_dialect
                ? `DB: ${adminMonitoring.database_dialect.toUpperCase()}`
                : 'Live Backend'}
            </div>

            <div className="h-5 w-px bg-slate-200 mx-1" />

            {/* Admin User Profile */}
            <div className="relative">
              <button
                onClick={() => setShowAdminMenu(!showAdminMenu)}
                className="flex items-center gap-2.5 p-1.5 pl-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
              >
                <div className="h-8 w-8 rounded-full bg-amber-600 text-white font-semibold text-xs flex items-center justify-center ring-2 ring-amber-100 shadow-xs">
                  {adminInitials}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-slate-800 leading-tight">{adminName}</div>
                  <div className="text-[10px] text-amber-600 font-bold leading-tight">{currentUser?.role}</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
              </button>

              {showAdminMenu && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl bg-white shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-800">{adminName}</p>
                    <p className="text-[11px] text-slate-500 truncate">{currentUser?.email}</p>
                  </div>
                  <div className="py-1">
                    <NavLink
                      to="/admin/system"
                      onClick={() => setShowAdminMenu(false)}
                      className="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      System Configuration & Audits
                    </NavLink>
                    <button
                      onClick={() => {
                        setShowAdminMenu(false);
                        navigate('/app/dashboard');
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium transition-colors"
                    >
                      Switch to Customer Portal
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Admin Workspace */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/80">
          {adminError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{adminError}</span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};
