import React, { useState, lazy, Suspense } from 'react';
import { Home, MonitorCheck, FileText, ClipboardCheck, LogOut, BookOpen, Soup, UtensilsCrossed, Image as ImageIcon, Settings } from 'lucide-react';
import { useSaidasPendentesCount } from '../hooks/useSaidasPendentesCount';
import LoadingLogo from './LoadingLogo';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { SidebarItem, SidebarGroup, SidebarToggleButton, SidebarLogoutItem } from './SidebarNav';
import MobileBottomNav from './MobileBottomNav';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useRecolherSubmenusNoMobile } from '../hooks/useRecolherSubmenusNoMobile';
import { useSchoolConfig } from '../lib/schoolConfig';
import { ocultoNoTradicional } from '../tradicional/menus';

// Lazy: mesmo padrão de code-splitting já usado no AdminPortal/FamilyPortal —
// cada tela só entra no bundle quando o professor realmente abre aquela aba.
const TeacherInicio = lazy(() => import('./TeacherInicio'));
const TeacherMonitor = lazy(() => import('./TeacherMonitor'));
const SaidasPendentes = lazy(() => import('./SaidasPendentes'));
const TeacherMapaHabilidades = lazy(() => import('./TeacherMapaHabilidades'));
const TeacherMitigacao = lazy(() => import('./TeacherMitigacao'));
const TeacherFrequencia = lazy(() => import('./TeacherFrequencia'));
const AdminDiario = lazy(() => import('./AdminDiario'));
// Cardápio: o professor só visualiza (quem cadastra é Gestão/Coordenação/Direção).
const FamilyCardapio = lazy(() => import('./FamilyCardapio'));
const AdminMuralFotos = lazy(() => import('./AdminMuralFotos'));
const ConfiguracoesPortal = lazy(() => import('./ConfigSubmenu'));

// Mesmos submenus, mesmas chaves de aba e mesma ordem do menu Relatórios do
// AdminPortal — pedido explícito pra ficar "exatamente igual".
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-mapa-habilidades', label: 'Mapa de Habilidades' },
];

export default function TeacherPortal({
  currentUser, currentSchool,
  students, authorized,
  teacherTab, setTeacherTab,
  isMobileMenuOpen, setIsMobileMenuOpen,
  onLogout,
}) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => setOpenAccordion(openAccordion === name ? null : name);
  // Controla o expandir/recolher da sidebar no desktop via estado (não só
  // :hover do CSS) — assim dá pra forçar o recolhimento ao clicar em um
  // item, mesmo que o mouse ainda esteja em cima do menu.
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();
  const isDesktop = useIsDesktop();
  useRecolherSubmenusNoMobile(isMobileMenuOpen, isDesktop, setOpenAccordion);
  const collapsed = isDesktop && !isSidebarExpanded;
  const go = (tab) => {
    setTeacherTab(tab);
    registerClick(tab);
    setIsMobileMenuOpen(false);
  };
  const isBlocked = currentUser?.teacher_status && currentUser.teacher_status !== 'ativo';
  const { method } = useSchoolConfig(currentSchool?.id);
  const relatoriosAtivos = currentSchool?.features_enabled?.relatorios_pedagogicos === true;
  // Escola Tradicional não tem Mitigação nem Mapa de Habilidades.
  const showRelatorios = relatoriosAtivos && !ocultoNoTradicional(method, 'rel-mitigacao');
  const showFrequencia = currentSchool?.features_enabled?.frequencia === true;
  // O portal do professor só existia atrás da flag do Módulo Pedagógico
  // inteiro -- uma escola que só contratou Frequência (ex: Montessori sem
  // os relatórios formais) ficava sem acesso a NADA aqui, incluindo
  // Início/Monitor. Agora basta QUALQUER um dos dois módulos acadêmicos
  // estar ativo; cada item específico (Relatórios/Frequência) continua
  // com sua própria flag dentro do portal.
  // Módulo Rotina e família (chaves diario, mural, cardapio).
  const showDiario = currentSchool?.features_enabled?.diario === true;
  const showCardapio = currentSchool?.features_enabled?.cardapio === true;
  const showMural = currentSchool?.features_enabled?.mural === true;
  const moduleEnabled = relatoriosAtivos || showFrequencia || showDiario || showCardapio || showMural;
  const showSaidasPendentes = currentSchool?.features_enabled?.checkin !== false;
  const saidasPendentesCount = useSaidasPendentesCount(currentUser?.school_id, showSaidasPendentes && !isBlocked && moduleEnabled);

  if (!moduleEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-surface-container-lowest rounded-zela-lg border border-outline-variant p-8 text-center max-w-sm">
          <h2 className="text-h3 text-on-surface mb-2">Módulo não disponível</h2>
          <p className="text-on-surface-variant text-small">
            O Módulo Pedagógico ainda não foi contratado para esta escola. Fale com a administração.
          </p>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-surface-container-lowest rounded-zela-lg border border-outline-variant p-8 text-center max-w-sm">
          <h2 className="text-h3 text-on-surface mb-2">Acesso indisponível</h2>
          <p className="text-on-surface-variant text-small">
            Sua conta de professor está {currentUser.teacher_status === 'bloqueado' ? 'bloqueada' : 'inativa'}.
            Entre em contato com a administração da escola.
          </p>
        </div>
      </div>
    );
  }

  const monitorCount = (students || []).filter(s => ['pending_entry', 'pending_exit'].includes(s.status)).length;

  return (
    <div className="flex flex-col md:flex-row gap-0 w-full h-full animate-in fade-in md:relative">
      {/* MENU LATERAL (SIDEBAR) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:sticky top-[60px] md:top-16 left-0 h-[calc(100dvh-60px-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-4rem)] w-full md:w-72 shrink-0 z-20 md:z-30 bg-ink border-r border-ink-line transform transition-all duration-300 ease-in-out md:translate-x-0 md:translate-y-0 ${isMobileMenuOpen ? 'translate-y-0' : 'translate-y-full'} ${isSidebarExpanded ? 'md:w-[248px]' : 'md:w-[72px]'}`}
      >
        <SidebarToggleButton isExpanded={isSidebarExpanded} onToggle={toggleSidebarExpanded} />
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 md:px-[18px] md:group-data-[expanded=true]/side:px-4 pt-4 pb-2 space-y-1">
            <SidebarItem active={teacherTab === 'home'} icon={Home} label="Início" onClick={() => go('home')} />
            <SidebarItem active={teacherTab === 'monitor'} icon={MonitorCheck} label="Monitor" badge={monitorCount > 0 ? monitorCount : null} onClick={() => go('monitor')} />
            {showFrequencia && (
              <SidebarItem active={teacherTab === 'frequencia'} icon={ClipboardCheck} label="Frequência" onClick={() => go('frequencia')} />
            )}
            {showSaidasPendentes && (
              <SidebarItem active={teacherTab === 'saidas-pendentes'} icon={LogOut} label="Saídas Pendentes" badge={saidasPendentesCount > 0 ? saidasPendentesCount : null} onClick={() => go('saidas-pendentes')} />
            )}
            {(showDiario || showCardapio || showMural) && (
              <SidebarGroup
                collapsed={collapsed}
                label="Acadêmico"
                icon={BookOpen}
                isOpen={openAccordion === 'academico'}
                onToggle={() => toggleAccordion('academico')}
              >
                {showDiario && (
                  <SidebarItem active={teacherTab === 'diario'} icon={Soup} label="Diário" onClick={() => go('diario')} />
                )}
                {showCardapio && (
                  <SidebarItem active={teacherTab === 'cardapio'} icon={UtensilsCrossed} label="Cardápio" onClick={() => go('cardapio')} />
                )}
                {showMural && (
                  <SidebarItem active={teacherTab === 'mural-fotos'} icon={ImageIcon} label="Mural de Fotos" onClick={() => go('mural-fotos')} />
                )}
              </SidebarGroup>
            )}

            {showRelatorios && (
              <SidebarGroup
                collapsed={collapsed}
                label="Relatórios"
                icon={FileText}
                isOpen={openAccordion === 'relatorios'}
                onToggle={() => toggleAccordion('relatorios')}
              >
                {RELATORIOS_SUBMENU.map(r => (
                  <SidebarItem key={r.key} active={teacherTab === r.key} icon={FileText} label={r.label} onClick={() => go(r.key)} />
                ))}
              </SidebarGroup>
            )}

            <SidebarItem active={teacherTab === 'settings'} icon={Settings} label="Configurações" onClick={() => go('settings')} />
          </nav>
          <SidebarLogoutItem onLogout={onLogout} />
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col border-t border-outline-variant/60 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingLogo logoUrl={currentSchool?.logo_url} size={72} /></div>}>
          {teacherTab === 'home' && (
            <TeacherInicio currentUser={currentUser} setTeacherTab={setTeacherTab} clickCounts={clickCounts} registerClick={registerClick} monitorCount={monitorCount} showFrequencia={showFrequencia} showRelatorios={showRelatorios} />
          )}
          {teacherTab === 'monitor' && (
            <TeacherMonitor students={students || []} authorized={authorized} />
          )}
          {teacherTab === 'frequencia' && (
            <TeacherFrequencia currentUser={currentUser} currentSchool={currentSchool} />
          )}
          {teacherTab === 'saidas-pendentes' && <SaidasPendentes currentUser={currentUser} currentSchool={currentSchool} />}
          {teacherTab === 'diario' && showDiario && <AdminDiario currentUser={currentUser} currentSchool={currentSchool} />}
          {teacherTab === 'cardapio' && showCardapio && <FamilyCardapio currentUser={currentUser} currentSchool={currentSchool} />}
          {teacherTab === 'mural-fotos' && showMural && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}
          {teacherTab === 'rel-mitigacao' && !ocultoNoTradicional(method, teacherTab) && <TeacherMitigacao currentUser={currentUser} currentSchool={currentSchool} />}
          {teacherTab === 'rel-mapa-habilidades' && !ocultoNoTradicional(method, teacherTab) && <TeacherMapaHabilidades currentUser={currentUser} currentSchool={currentSchool} />}
          {teacherTab === 'settings' && <ConfiguracoesPortal />}
        </Suspense>
      </main>

      <MobileBottomNav
        items={[
          { key: 'home', label: 'Início', icon: Home, active: teacherTab === 'home', onClick: () => go('home') },
          { key: 'monitor', label: 'Monitor', icon: MonitorCheck, active: teacherTab === 'monitor', onClick: () => go('monitor'), badge: monitorCount },
          { key: 'diario', label: 'Diário', icon: Soup, active: teacherTab === 'diario', onClick: () => go('diario'), show: showDiario },
        ]}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />
    </div>
  );
}
