import React, { Suspense, lazy } from 'react';
import { CalendarDays, Home, Images, Megaphone, Users, LogOut } from 'lucide-react';
import { SidebarItem, SidebarToggleButton, SidebarLogoutItem } from './SidebarNav';
import MobileBottomNav from './MobileBottomNav';
import LoadingLogo from './LoadingLogo';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';

const MarketingInicio = lazy(() => import('./MarketingInicio'));
const MarketingAlunos = lazy(() => import('./MarketingAlunos'));
const AdminCalendario = lazy(() => import('./AdminCalendario'));
const AdminCadastroComunicados = lazy(() => import('./AdminCadastroComunicados'));
const AdminMuralFotos = lazy(() => import('./AdminMuralFotos'));

// Portal do perfil Marketing (PLANO_MARKETING.md, A5). Menu reduzido: Alunos,
// Calendário, Comunicados e Mural de fotos. Sem chat, financeiro, check-in,
// totem, ficha médica, documentos nem configurações. Quem barra de verdade é o
// banco (regras "Marketing ..."); com o módulo desligado, nada abre.
// Layout igual ao dos outros portais: sidebar (desktop) / menu hambúrguer
// (celular, aberto pelo botão "Menu" da barra inferior ou do cabeçalho).
const ABAS = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'alunos', label: 'Alunos', icon: Users },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'comunicados', label: 'Comunicados', icon: Megaphone },
  { id: 'mural', label: 'Mural de fotos', icon: Images },
];

// Abas que no celular ficam só no menu hambúrguer, fora da barra inferior.
const ABAS_AUTOCONTIDAS = ['calendario', 'comunicados', 'mural'];
const ABAS_NO_MENU =['comunicados', 'mural'];

export default function MarketingPortal({ currentUser, currentSchool, marketingTab, setMarketingTab, isMobileMenuOpen, setIsMobileMenuOpen, onLogout }) {
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();
  const aba = marketingTab || 'inicio';
  const moduloLigado = currentSchool?.features_enabled?.marketing === true;
  const go = (id) => {
    setMarketingTab(id);
    setIsMobileMenuOpen(false);
  };

  if (!moduloLigado) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-3">
        <h2 className="text-lg font-semibold text-on-surface">Marketing indisponível</h2>
        <p className="text-sm text-on-surface-variant">O módulo Marketing não está ativo para esta escola. Fale com a Gestão.</p>
        <button type="button" onClick={onLogout} className="px-4 py-2 rounded-zela-md border border-outline-variant text-sm font-semibold inline-flex items-center gap-2">
          <LogOut size={16} aria-hidden="true" /> Sair
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-0 w-full h-full animate-in fade-in md:relative">
      {/* MENU LATERAL (SIDEBAR) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:sticky top-[60px] md:top-14 left-0 h-[calc(100dvh-60px-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem)] w-full md:w-72 shrink-0 z-20 md:z-30 bg-ink border-r border-ink-line transform transition-all duration-300 ease-in-out md:translate-x-0 md:translate-y-0 ${isMobileMenuOpen ? 'translate-y-0' : 'translate-y-full'} ${isSidebarExpanded ? 'md:w-[248px]' : 'md:w-[72px]'}`}
      >
        <SidebarToggleButton isExpanded={isSidebarExpanded} onToggle={toggleSidebarExpanded} />
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          <nav aria-label="Menu do Marketing" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 md:px-[18px] md:group-data-[expanded=true]/side:px-4 pt-4 pb-2 space-y-1">
            {ABAS.map(({ id, label, icon }) => (
              <SidebarItem key={id} active={aba === id} icon={icon} label={label} onClick={() => go(id)} />
            ))}
          </nav>
          <SidebarLogoutItem onLogout={onLogout} />
        </div>
      </aside>

      <MobileBottomNav
        items={ABAS.filter(a => !ABAS_NO_MENU.includes(a.id)).map(({ id, label, icon }) => ({ key: id, label, icon, active: aba === id, onClick: () => setMarketingTab(id) }))}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col border-t border-outline-variant/60 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Calendário, Comunicados e Mural já trazem a própria margem negativa e
            padding (-m-3 ...). Aqui o wrapper sobe -m-3 e devolve p-3, que a
            margem do filho cancela: ocupa toda a área branca, sem moldura cinza
            e sem scroll lateral. */}
        <div className={ABAS_AUTOCONTIDAS.includes(aba) ? 'h-full -m-3 sm:m-0 p-3 sm:p-0 bg-surface overflow-x-hidden' : 'h-full -m-3 sm:m-0 bg-surface p-2.5 sm:p-4 md:p-6 lg:p-8 xl:p-10 overflow-y-auto'}>
          <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingLogo logoUrl={currentSchool?.logo_url} size={72} /></div>}>
            {aba === 'inicio' && <MarketingInicio currentUser={currentUser} currentSchool={currentSchool} abas={ABAS.filter(a => a.id !== 'inicio')} onSelect={setMarketingTab} />}
            {aba === 'alunos' && <MarketingAlunos />}
            {aba === 'calendario' && <AdminCalendario currentUser={currentUser} currentSchool={currentSchool} />}
            {aba === 'comunicados' && <AdminCadastroComunicados currentUser={currentUser} currentSchool={currentSchool} />}
            {aba === 'mural' && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
