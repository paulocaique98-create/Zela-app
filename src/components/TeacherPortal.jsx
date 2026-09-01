import React, { useState, lazy, Suspense } from 'react';
import { Home, AlertCircle, FileText, ClipboardCheck } from 'lucide-react';
import LoadingLogo from './LoadingLogo';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { SidebarItem, SidebarGroup } from './SidebarNav';

// Lazy: mesmo padrão de code-splitting já usado no AdminPortal/FamilyPortal —
// cada tela só entra no bundle quando o professor realmente abre aquela aba.
const TeacherInicio = lazy(() => import('./TeacherInicio'));
const TeacherMonitor = lazy(() => import('./TeacherMonitor'));
const AdminRelatorioPlaceholder = lazy(() => import('./AdminRelatorioPlaceholder'));
const TeacherMitigacao = lazy(() => import('./TeacherMitigacao'));
const TeacherFrequencia = lazy(() => import('./TeacherFrequencia'));

// Mesmos submenus, mesmas chaves de aba e mesma ordem do menu Relatórios do
// AdminPortal — pedido explícito pra ficar "exatamente igual".
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-mapa-habilidades', label: 'Mapa de Habilidades' },
  { key: 'rel-semestral', label: 'Semestral' },
];

export default function TeacherPortal({
  currentUser, currentSchool,
  students, authorized,
  teacherTab, setTeacherTab,
  isMobileMenuOpen, setIsMobileMenuOpen,
}) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => setOpenAccordion(openAccordion === name ? null : name);
  // Controla o expandir/recolher da sidebar no desktop via estado (não só
  // :hover do CSS) — assim dá pra forçar o recolhimento ao clicar em um
  // item, mesmo que o mouse ainda esteja em cima do menu.
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const go = (tab) => {
    setTeacherTab(tab);
    registerClick(tab);
    setIsMobileMenuOpen(false);
    setIsSidebarExpanded(false);
  };
  const isBlocked = currentUser?.teacher_status && currentUser.teacher_status !== 'ativo';
  const showRelatorios = currentSchool?.features_enabled?.relatorios_pedagogicos === true;
  const showFrequencia = currentSchool?.features_enabled?.frequencia === true;
  // O portal do professor só existia atrás da flag do Módulo Pedagógico
  // inteiro -- uma escola que só contratou Frequência (ex: Montessori sem
  // os relatórios formais) ficava sem acesso a NADA aqui, incluindo
  // Início/Monitor. Agora basta QUALQUER um dos dois módulos acadêmicos
  // estar ativo; cada item específico (Relatórios/Frequência) continua
  // com sua própria flag dentro do portal.
  const moduleEnabled = showRelatorios || showFrequencia;

  if (!moduleEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-surface-container-lowest rounded-zela-xl border border-outline-variant shadow-sm p-8 text-center max-w-sm">
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
        <div className="bg-surface-container-lowest rounded-zela-xl border border-outline-variant shadow-sm p-8 text-center max-w-sm">
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
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in md:relative">
      {/* MENU LATERAL (SIDEBAR) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:sticky top-[60px] md:top-16 left-0 h-[calc(100dvh-60px)] md:h-[calc(100dvh-4rem)] w-72 shrink-0 z-20 md:z-auto bg-surface-container-low border-r border-outline-variant transform transition-all duration-300 ease-in-out md:translate-x-0 overflow-hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarExpanded ? 'md:w-[280px]' : 'md:w-16'}`}
      >
        <div className="h-full flex flex-col min-h-0">
          <nav className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2 space-y-1">
            <SidebarItem active={teacherTab === 'home'} icon={Home} label="Início" onClick={() => go('home')} />
            <SidebarItem active={teacherTab === 'monitor'} icon={AlertCircle} label="Monitor" badge={monitorCount > 0 ? monitorCount : null} onClick={() => go('monitor')} />
            {showFrequencia && (
              <SidebarItem active={teacherTab === 'frequencia'} icon={ClipboardCheck} label="Frequência" onClick={() => go('frequencia')} />
            )}

            {showRelatorios && (
              <SidebarGroup
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
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingLogo logoUrl={currentSchool?.logo_url} size={72} /></div>}>
          {teacherTab === 'home' && (
            <TeacherInicio currentUser={currentUser} setTeacherTab={setTeacherTab} clickCounts={clickCounts} registerClick={registerClick} monitorCount={monitorCount} />
          )}
          {teacherTab === 'monitor' && (
            <TeacherMonitor students={students || []} authorized={authorized} />
          )}
          {teacherTab === 'frequencia' && (
            <TeacherFrequencia currentUser={currentUser} currentSchool={currentSchool} />
          )}
          {teacherTab === 'rel-mitigacao' && <TeacherMitigacao currentUser={currentUser} currentSchool={currentSchool} />}
          {RELATORIOS_SUBMENU.filter(r => r.key !== 'rel-mitigacao').map(r => teacherTab === r.key && (
            <AdminRelatorioPlaceholder key={r.key} title={r.label} />
          ))}
        </Suspense>
      </main>
    </div>
  );
}
