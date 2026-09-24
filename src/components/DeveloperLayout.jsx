import React, { lazy, Suspense } from 'react';
import { Building2, Receipt, FileText, LifeBuoy, Settings } from 'lucide-react';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';
import { SidebarToggleButton } from './SidebarNav';

// Lazy: cada aba só entra no bundle quando o developer realmente abre ela.
const DeveloperPanel = lazy(() => import('./DeveloperPanel'));
const ConfiguracoesPanel = lazy(() => import('./ConfiguracoesPanel'));
const DeveloperChatSupport = lazy(() => import('./DeveloperChatSupport'));
const DeveloperErrorLogs = lazy(() => import('./DeveloperErrorLogs'));

export default function DeveloperLayout({ currentUser, onUpdateGlobalLogo, isMobileMenuOpen, setIsMobileMenuOpen, activeTab, setActiveTab }) {
  const { count: chatUnreadCount, refresh: refreshChatUnread } = useChatUnreadCount(currentUser, true);
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();

  const navItems = [
    { id: 'schools', label: 'Gestão de Escolas', icon: Building2, enabled: true },
    { id: 'billing', label: 'Faturamento', icon: Receipt, enabled: false },
    { id: 'logs', label: 'Logs', icon: FileText, enabled: true },
    { id: 'support', label: 'Suporte', icon: LifeBuoy, enabled: true },
    { id: 'settings', label: 'Configurações', icon: Settings, enabled: true },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-0 w-full h-full animate-in fade-in">
      {/* MENU LATERAL (SIDEBAR) */}
      {/* OVERLAY PARA MOBILE */}
      <div 
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:relative top-[60px] md:top-auto left-0 md:left-auto h-[calc(100dvh-60px)] md:h-auto w-64 shrink-0 z-20 md:z-30 bg-dev-bg border-r border-dev-border transform transition-all duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarExpanded ? 'md:w-[240px]' : 'md:w-16'}`}
      >
        <SidebarToggleButton
          isExpanded={isSidebarExpanded}
          onToggle={toggleSidebarExpanded}
          borderColorClass="border-dev-border"
          bgColorClass="bg-dev-bg hover:bg-dev-surface-high"
        />
        <div className="h-full flex flex-col overflow-y-auto overflow-x-hidden scrollbar-none">
          <p className="px-4 pt-4 pb-2 text-[11px] font-black text-dev-text-muted uppercase tracking-widest shrink-0 truncate whitespace-nowrap md:hidden md:group-data-[expanded=true]/side:block">
            Painel do Dev
          </p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 px-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              if (!item.enabled) {
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 pl-4 pr-4 md:pl-[7px] md:pr-[7px] md:group-data-[expanded=true]/side:pl-4 md:group-data-[expanded=true]/side:pr-4 py-2.5 rounded-zela-md text-sm font-medium text-dev-text-muted opacity-60 cursor-not-allowed"
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate whitespace-nowrap md:hidden md:group-data-[expanded=true]/side:inline">{item.label}</span>
                    <span className="ml-auto bg-dev-surface-high text-[9px] px-1.5 py-0.5 rounded text-dev-text-muted font-bold uppercase tracking-wide md:hidden md:group-data-[expanded=true]/side:inline-block">
                      Em breve
                    </span>
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                    if (item.id === 'support') refreshChatUnread();
                  }}
                  className={`flex items-center gap-3 pl-4 pr-4 md:pl-[7px] md:pr-[7px] md:group-data-[expanded=true]/side:pl-4 md:group-data-[expanded=true]/side:pr-4 py-2.5 rounded-zela-md text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-dev-primary-container text-dev-primary'
                      : 'text-dev-text-muted hover:bg-dev-surface hover:text-dev-text'
                  }`}
                >
                  <span className="relative shrink-0">
                    <Icon size={18} />
                    {item.id === 'support' && chatUnreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[9px] font-black flex items-center justify-center md:group-data-[expanded=true]/side:hidden">
                        {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                      </span>
                    )}
                  </span>
                  <span className="flex-1 text-left truncate whitespace-nowrap md:hidden md:group-data-[expanded=true]/side:inline">{item.label}</span>
                  {item.id === 'support' && chatUnreadCount > 0 && (
                    <span className="hidden md:group-data-[expanded=true]/side:flex ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[9px] font-black items-center justify-center">
                      {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col border-t border-dev-border">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>}>
          {activeTab === 'schools' && (
            <DeveloperPanel
              currentUser={currentUser}
            />
          )}
          {activeTab === 'settings' && (
            <ConfiguracoesPanel
              onUpdateGlobalLogo={onUpdateGlobalLogo}
            />
          )}
          {activeTab === 'support' && (
            <DeveloperChatSupport currentUser={currentUser} />
          )}
          {activeTab === 'logs' && (
            <DeveloperErrorLogs currentUser={currentUser} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
