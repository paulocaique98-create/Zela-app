import React, { useState, lazy, Suspense } from 'react';
import { Building2, Receipt, FileText, LifeBuoy, Settings } from 'lucide-react';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';

// Lazy: cada aba só entra no bundle quando o developer realmente abre ela.
const DeveloperPanel = lazy(() => import('./DeveloperPanel'));
const ConfiguracoesPanel = lazy(() => import('./ConfiguracoesPanel'));
const DeveloperChatSupport = lazy(() => import('./DeveloperChatSupport'));

export default function DeveloperLayout({ currentUser, onUpdateGlobalLogo, isMobileMenuOpen, setIsMobileMenuOpen, onLogout }) {
  const [activeTab, setActiveTab] = useState('schools');
  const { count: chatUnreadCount, refresh: refreshChatUnread } = useChatUnreadCount(currentUser, true);

  const navItems = [
    { id: 'schools', label: 'Gestão de Escolas', icon: Building2, enabled: true },
    { id: 'billing', label: 'Faturamento', icon: Receipt, enabled: false },
    { id: 'logs', label: 'Logs', icon: FileText, enabled: false },
    { id: 'support', label: 'Suporte', icon: LifeBuoy, enabled: true },
    { id: 'settings', label: 'Configurações', icon: Settings, enabled: true },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in">
      {/* MENU LATERAL (SIDEBAR) */}
      {/* OVERLAY PARA MOBILE */}
      <div 
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside className={`fixed md:sticky top-[60px] md:top-16 left-0 h-[calc(100dvh-60px)] md:h-[calc(100dvh-4rem)] w-64 md:w-[240px] shrink-0 z-20 md:z-auto bg-dev-bg border-r border-dev-border transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col overflow-y-auto">
          <p className="px-4 pt-4 pb-2 text-[11px] font-black text-dev-text-muted uppercase tracking-widest shrink-0">
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
                    className="flex items-center gap-3 px-4 py-2.5 rounded-zela-md text-sm font-medium text-dev-text-muted opacity-60 cursor-not-allowed"
                  >
                    <Icon size={18} />
                    {item.label}
                    <span className="ml-auto bg-dev-surface-high text-[9px] px-1.5 py-0.5 rounded text-dev-text-muted font-bold uppercase tracking-wide">
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
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-zela-md text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-dev-primary-container text-dev-primary'
                      : 'text-dev-text-muted hover:bg-dev-surface hover:text-dev-text'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                  {item.id === 'support' && chatUnreadCount > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[9px] font-black flex items-center justify-center">
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
      <main className="flex-1 min-w-0 h-full flex flex-col">
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
        </Suspense>
      </main>
    </div>
  );
}
