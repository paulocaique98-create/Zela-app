import React, { useState, lazy, Suspense } from 'react';
import { Home, AlertCircle, FileText } from 'lucide-react';
import LoadingLogo from './LoadingLogo';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { SidebarItem, SidebarGroup } from './SidebarNav';

// Lazy: mesmo padrão de code-splitting já usado no AdminPortal/FamilyPortal —
// cada tela só entra no bundle quando o professor realmente abre aquela aba.
const TeacherInicio = lazy(() => import('./TeacherInicio'));
const TeacherMonitor = lazy(() => import('./TeacherMonitor'));
const AdminRelatorioPlaceholder = lazy(() => import('./AdminRelatorioPlaceholder'));
const TeacherMitigacao = lazy(() => import('./TeacherMitigacao'));

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
  onLogout,
}) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => setOpenAccordion(openAccordion === name ? null : name);
  const isBlocked = currentUser?.teacher_status && currentUser.teacher_status !== 'ativo';
  const moduleEnabled = currentSchool?.features_enabled?.relatorios_pedagogicos === true;

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
        className={`group fixed md:sticky top-[60px] md:top-16 left-0 h-[calc(100dvh-60px)] md:h-[calc(100dvh-4rem)] w-72 md:w-16 md:hover:w-[280px] shrink-0 z-20 md:z-auto bg-surface-container-low border-r border-outline-variant transform transition-all duration-300 ease-in-out md:translate-x-0 overflow-hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-full flex flex-col min-h-0">
          <nav className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2 space-y-1">
            <SidebarItem active={teacherTab === 'home'} icon={Home} label="Início" onClick={() => { setTeacherTab('home'); registerClick('home'); setIsMobileMenuOpen(false); }} />
            <SidebarItem active={teacherTab === 'monitor'} icon={AlertCircle} label="Monitor" badge={monitorCount > 0 ? monitorCount : null} onClick={() => { setTeacherTab('monitor'); registerClick('monitor'); setIsMobileMenuOpen(false); }} />

            <SidebarGroup
              label="Relatórios"
              icon={FileText}
              isOpen={openAccordion === 'relatorios' || RELATORIOS_SUBMENU.some(r => r.key === teacherTab)}
              onToggle={() => toggleAccordion('relatorios')}
            >
              {RELATORIOS_SUBMENU.map(r => (
                <SidebarItem key={r.key} active={teacherTab === r.key} icon={FileText} label={r.label} onClick={() => { setTeacherTab(r.key); registerClick(r.key); setIsMobileMenuOpen(false); }} />
              ))}
            </SidebarGroup>
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
          {teacherTab === 'rel-mitigacao' && <TeacherMitigacao currentUser={currentUser} currentSchool={currentSchool} />}
          {RELATORIOS_SUBMENU.filter(r => r.key !== 'rel-mitigacao').map(r => teacherTab === r.key && (
            <AdminRelatorioPlaceholder key={r.key} title={r.label} />
          ))}
        </Suspense>
      </main>
    </div>
  );
}
