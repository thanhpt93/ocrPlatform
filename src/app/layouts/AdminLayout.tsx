import React, { useState } from 'react';
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
  Bell,
  ArrowRightLeft,
  ChevronDown,
  ShieldCheck,
  Server,
  Sparkles,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { searchQuery, setSearchQuery } = usePlatformStore();
  const [showAdminMenu, setShowAdminMenu] = useState(false);

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
        { label: 'OCR Monitoring & Queues', path: '/admin/monitoring', icon: Activity },
        { label: 'System Settings & Audit', path: '/admin/system', icon: Sliders },
      ],
    },
  ];

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

        {/* System Health Status Indicator */}
        <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-slate-300">Cluster Status: Healthy</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">5 Workers</span>
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
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
              <Server className="h-3.5 w-3.5 text-amber-600" />
              Production Control Plane
            </div>

            <div className="h-5 w-px bg-slate-200 mx-1" />

            {/* Admin User Profile */}
            <div className="relative">
              <button
                onClick={() => setShowAdminMenu(!showAdminMenu)}
                className="flex items-center gap-2.5 p-1.5 pl-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
              >
                <div className="h-8 w-8 rounded-full bg-amber-600 text-white font-semibold text-xs flex items-center justify-center ring-2 ring-amber-100 shadow-xs">
                  CN
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-slate-800 leading-tight">Christopher Nolan</div>
                  <div className="text-[10px] text-amber-600 font-bold leading-tight">Super Administrator</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
              </button>

              {showAdminMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-800">Christopher Nolan</p>
                    <p className="text-[11px] text-slate-500 truncate">admin.chris@ocrplatform.internal</p>
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
                      Return to Customer Portal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Admin Workspace */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/80">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
