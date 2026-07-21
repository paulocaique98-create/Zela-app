import React, { useState } from 'react';
import { Building2, Receipt, FileText, LifeBuoy, Settings } from 'lucide-react';
import DeveloperPanel from './DeveloperPanel';
import ConfiguracoesPanel from './ConfiguracoesPanel';

export default function DeveloperLayout({ currentUser, onUpdateGlobalLogo, isMobileMenuOpen, setIsMobileMenuOpen, onLogout }) {
  const [activeTab, setActiveTab] = useState('schools');

  const navItems = [
    { id: 'schools', label: 'Gestão de Escolas', icon: Building2, enabled: true },
    { id: 'billing', label: 'Faturamento', icon: Receipt, enabled: false },
    { id: 'logs', label: 'Logs', icon: FileText, enabled: false },
    { id: 'support', label: 'Suporte', icon: LifeBuoy, enabled: false },
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

      <aside className={`fixed md:relative top-0 left-0 h-[100dvh] md:h-full w-64 md:w-52 shrink-0 z-20 md:z-auto transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full bg-gradient-to-b from-slate-900 to-indigo-950 p-3 pt-28 md:pt-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-800 flex flex-col overflow-y-auto">
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
                  onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
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
      </main>
    </div>
  );
}
