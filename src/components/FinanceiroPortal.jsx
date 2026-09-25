import React from 'react';
import { Home } from 'lucide-react';
import { SidebarItem, SidebarToggleButton } from './SidebarNav';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';
import FinanceiroInicio from './FinanceiroInicio';

// Portal Financeiro/Administrativo -- scaffold. Espelha à risca a casca do
// AdminPortal.jsx (aside/nav/main, mesmas classes, mesmo comportamento de
// sidebar retrátil) sem nenhum item de menu real ainda: Financeiro e
// Correções de Presença continuam no Admin por enquanto e serão migrados
// numa etapa própria, futura (mexe em RLS/RPC, risco maior).
export default function FinanceiroPortal({
  currentUser, currentSchool,
  financeiroTab, setFinanceiroTab,
  isMobileMenuOpen, setIsMobileMenuOpen,
  onLogout,
}) {
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();
  const go = (tab) => {
    setFinanceiroTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex flex-col md:flex-row gap-0 w-full h-full animate-in fade-in md:relative">
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:sticky top-[60px] md:top-16 left-0 h-[calc(100dvh-60px)] md:h-[calc(100dvh-4rem)] w-72 shrink-0 z-20 md:z-30 bg-surface-container-low border-r border-outline-variant transform transition-all duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarExpanded ? 'md:w-[280px]' : 'md:w-16'}`}
      >
        <SidebarToggleButton isExpanded={isSidebarExpanded} onToggle={toggleSidebarExpanded} />
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          <nav className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2 space-y-1">
            <SidebarItem active={financeiroTab === 'home'} icon={Home} label="Início" onClick={() => go('home')} />
            {/* Próximos menus (Financeiro, Correções de Presença...) entram aqui quando forem migrados do Admin. */}
          </nav>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full flex flex-col border-t border-outline-variant/60">
        {financeiroTab === 'home' && (
          <FinanceiroInicio currentUser={currentUser} currentSchool={currentSchool} />
        )}
      </main>
    </div>
  );
}
