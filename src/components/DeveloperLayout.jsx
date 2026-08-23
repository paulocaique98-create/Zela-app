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

      <aside className={`fixed md:relative top-[60px] md:top-0 left-0 h-[calc(100dvh-60px)] md:h-full w-64 md:w-52 shrink-0 z-20 md:z-auto transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full bg-gradient-to-b from-slate-900 to-indigo-950 p-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-800 flex flex-col overflow-y-auto">
          <p className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 mt-2 shrink-0">
            Painel do Dev
          </p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 pr-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              if (!item.enabled) {
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-500 opacity-60 cursor-not-allowed"
                  >
                    <Icon size={16} />
                    {item.label}
                    <span className="ml-auto bg-slate-800 text-[9px] px-1.5 py-0.5 rounded text-slate-400 font-bold uppercase tracking-wide">
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
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                  {item.id === 'support' && chatUnreadCount > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
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
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div></div>}>
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
