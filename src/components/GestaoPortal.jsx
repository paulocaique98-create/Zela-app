import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Home, Wallet, Clock, ClipboardCheck, GraduationCap, FileText } from 'lucide-react';
import { SidebarItem, SidebarGroup, SidebarToggleButton } from './SidebarNav';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { supabase } from '../lib/supabase';
import GestaoInicio from './GestaoInicio';

const AdminFinanceiro = lazy(() => import('./AdminFinanceiro'));
const AdminRelatorioHorasExtras = lazy(() => import('./AdminRelatorioHorasExtras'));
const AdminAttendanceCorrections = lazy(() => import('./AdminAttendanceCorrections'));
const GestaoAlunos = lazy(() => import('./GestaoAlunos'));
const GestaoAlunoPerfil = lazy(() => import('./GestaoAlunoPerfil'));
const AdminMatriculas = lazy(() => import('./AdminMatriculas'));

// Portal da Gestão (financeiro/administrativo). Espelha à risca a casca do
// AdminPortal.jsx (aside/nav/main, mesmas classes, mesmo comportamento de
// sidebar retrátil).
//
// Fase 3 do plano de migração: os menus abaixo aparecem AQUI também,
// reaproveitando os MESMOS componentes que o Admin usa -- a RLS das
// tabelas financeiras e de correção de presença já aceita admin OU gestao
// (ver migrations 20260926b/20260926c), então os dois portais funcionam em
// paralelo por um tempo, de propósito, antes do corte final (Fase 5/6)
// remover o item do Admin.
//   Grupo 1: Financeiro
//   Grupo 2: Correções de Presença / Horas Extras
export default function GestaoPortal({
  currentUser, currentSchool,
  gestaoTab, setGestaoTab,
  isMobileMenuOpen, setIsMobileMenuOpen,
  onLogout,
}) {
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();
  const isDesktop = useIsDesktop();
  const collapsed = isDesktop && !isSidebarExpanded;
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => setOpenAccordion(openAccordion === name ? null : name);
  const features = currentSchool?.features_enabled || {};
  const showFinanceiro = features.financeiro === true;
  const showCheckin = features.checkin !== false;
  const [selectedAlunoId, setSelectedAlunoId] = useState(null);
  const go = (tab) => {
    setGestaoTab(tab);
    setIsMobileMenuOpen(false);
    if (tab !== 'secretaria-alunos') setSelectedAlunoId(null);
  };

  // Badge de correções de presença aguardando aprovação -- mesmo padrão e
  // mesma fonte de dado do badge no AdminPortal.jsx.
  const [pendingCorrectionsCount, setPendingCorrectionsCount] = useState(0);
  useEffect(() => {
    if (!currentUser?.school_id) return;
    let cancelled = false;

    const refreshCount = async () => {
      const { count } = await supabase
        .from('attendance_corrections')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', currentUser.school_id)
        .eq('status', 'pending');
      if (!cancelled) setPendingCorrectionsCount(count || 0);
    };
    refreshCount();

    const channel = supabase
      .channel(`attendance-corrections-badge-gestao-${currentUser.school_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_corrections', filter: `school_id=eq.${currentUser.school_id}` }, refreshCount)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUser?.school_id]);

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
            <SidebarItem active={gestaoTab === 'home'} icon={Home} label="Início" onClick={() => go('home')} />
            <SidebarGroup
              collapsed={collapsed}
              label="Secretaria"
              icon={GraduationCap}
              isOpen={openAccordion === 'secretaria'}
              onToggle={() => toggleAccordion('secretaria')}
            >
              <SidebarItem active={gestaoTab === 'secretaria-alunos'} icon={GraduationCap} label="Alunos" onClick={() => go('secretaria-alunos')} />
              <SidebarItem active={gestaoTab === 'secretaria-matriculas'} icon={FileText} label="Matrículas" onClick={() => go('secretaria-matriculas')} />
            </SidebarGroup>
            {showFinanceiro && (
              <SidebarItem active={gestaoTab === 'financeiro'} icon={Wallet} label="Financeiro" onClick={() => go('financeiro')} />
            )}
            {showCheckin && (
              <>
                <SidebarItem active={gestaoTab === 'horas-extras'} icon={Clock} label="Horas Extras" onClick={() => go('horas-extras')} />
                <SidebarItem active={gestaoTab === 'attendance-corrections'} icon={ClipboardCheck} label="Correções de Presença" badge={pendingCorrectionsCount > 0 ? pendingCorrectionsCount : null} onClick={() => go('attendance-corrections')} />
              </>
            )}
          </nav>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full flex flex-col border-t border-outline-variant/60">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>}>
          {gestaoTab === 'home' && (
            <GestaoInicio currentSchool={currentSchool} setGestaoTab={setGestaoTab} pendingCorrectionsCount={pendingCorrectionsCount} />
          )}
          {gestaoTab === 'secretaria-alunos' && (
            selectedAlunoId ? (
              <GestaoAlunoPerfil currentUser={currentUser} studentId={selectedAlunoId} onBack={() => setSelectedAlunoId(null)} />
            ) : (
              <GestaoAlunos currentUser={currentUser} onOpenAluno={setSelectedAlunoId} />
            )
          )}
          {gestaoTab === 'secretaria-matriculas' && (
            <AdminMatriculas currentUser={currentUser} currentSchool={currentSchool} />
          )}
          {gestaoTab === 'financeiro' && (
            <AdminFinanceiro currentUser={currentUser} currentSchool={currentSchool} />
          )}
          {gestaoTab === 'horas-extras' && (
            <AdminRelatorioHorasExtras currentSchool={currentSchool} />
          )}
          {gestaoTab === 'attendance-corrections' && (
            <AdminAttendanceCorrections currentUser={currentUser} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
