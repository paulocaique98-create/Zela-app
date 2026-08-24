import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Home, CalendarDays, Settings, QrCode, Users, HeartPulse, ClipboardList, Folders, FileText, Bell, Image as ImageIcon, UtensilsCrossed, ShieldCheck, X, MessageCircle, Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import { usePushNotifications } from '../hooks/usePushNotifications';
import FamilyInicio from './FamilyInicio';
import { SidebarItem, SidebarGroup } from './SidebarNav';

// Lazy: cada tela só entra no bundle quando a família realmente abre aquela aba
// — mesmo padrão de code-splitting já usado no AdminPortal.
const FamilyMatriculas = lazy(() => import('./FamilyMatriculas'));
const FamilyFichaMedica = lazy(() => import('./FamilyFichaMedica'));
const FamilyCalendario = lazy(() => import('./FamilyCalendario'));
const FamilyComunicados = lazy(() => import('./FamilyComunicados'));
const FamilyMuralFotos = lazy(() => import('./FamilyMuralFotos'));
const FamilyCardapio = lazy(() => import('./FamilyCardapio'));
const FamilyChat = lazy(() => import('./FamilyChat'));
const FamilyHome = lazy(() => import('./FamilyHome'));
const FamilyHistory = lazy(() => import('./FamilyHistory'));
const FamilySettings = lazy(() => import('./FamilySettings'));
const FamilyAuthorized = lazy(() => import('./FamilyAuthorized'));
const FamilyRegistrationData = lazy(() => import('./FamilyRegistrationData'));
const FamilyGerenciarResponsaveis = lazy(() => import('./FamilyGerenciarResponsaveis'));
const FamilyRelatorioPlaceholder = lazy(() => import('./FamilyRelatorioPlaceholder'));
const FamilyMitigacao = lazy(() => import('./FamilyMitigacao'));

// Submenus do menu Relatórios visíveis para a família — só os relatórios que
// a escola de fato compartilha com os responsáveis (o Mapa de Habilidades é
// de uso interno da equipe pedagógica e nunca aparece aqui).
const FAMILY_RELATORIOS_SUBMENU = [
  { key: 'rel-semestral', label: 'Semestral' },
  { key: 'rel-mitigacao', label: 'Mitigação' },
];

export default function FamilyPortal({ 
  currentUser, 
  setCurrentUser,
  students, 
  familyTab, setFamilyTab, 
  updateStudentStatus,
  authorized, togglePhoto, onOpenAuthModal, currentSchool,
  isMobileMenuOpen, setIsMobileMenuOpen
}) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);
  const pushData = usePushNotifications(currentUser, currentSchool);

  const [dismissedPush, setDismissedPush] = useState(
    localStorage.getItem(`zela_push_dismissed_${currentUser?.id}`) === 'true'
  );
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);

  // Re-sincroniza ao trocar de usuário sem remontar o componente (ex: troca de conta),
  // senão o banner ficaria escondido usando a decisão de dispensa de outro usuário.
  useEffect(() => {
    setDismissedPush(localStorage.getItem(`zela_push_dismissed_${currentUser?.id}`) === 'true');
  }, [currentUser?.id]);

  const dismissPushBanner = () => {
    localStorage.setItem(`zela_push_dismissed_${currentUser?.id}`, 'true');
    setDismissedPush(true);
  };

  // Contagem de comunicados não lidos — usada no badge da Home. Recalcula sempre que
  // o usuário volta para a Home (após ler comunicados em FamilyComunicados).
  const [comunicadosUnread, setComunicadosUnread] = useState(0);
  useEffect(() => {
    const schoolId = currentSchool?.id || currentUser?.school_id;
    if (!schoolId || !currentUser?.id || familyTab !== 'home') return;

    let cancelled = false;
    (async () => {
      const [comunicadosRes, readsRes] = await Promise.all([
        supabase.from('comunicados').select('id').eq('school_id', schoolId),
        supabase.from('comunicado_reads').select('comunicado_id').eq('user_id', currentUser.id),
      ]);
      if (cancelled) return;
      if (comunicadosRes.error || readsRes.error) return;

      const readIds = new Set((readsRes.data || []).map(r => r.comunicado_id));
      const unread = (comunicadosRes.data || []).filter(c => !readIds.has(c.id)).length;
      setComunicadosUnread(unread);
    })();

    return () => { cancelled = true; };
  }, [currentSchool?.id, currentUser?.id, familyTab]);

  // Contagem de relatórios de Mitigação não lidos — mesmo padrão do badge de
  // comunicados acima, mas contra mitigacao_report_reads (marcado como lido ao
  // abrir o relatório em FamilyMitigacao).
  const [mitigacaoUnread, setMitigacaoUnread] = useState(0);
  useEffect(() => {
    const schoolId = currentSchool?.id || currentUser?.school_id;
    if (!schoolId || !currentUser?.id || familyTab !== 'home') return;

    let cancelled = false;
    (async () => {
      const [reportsRes, readsRes] = await Promise.all([
        supabase.from('mitigacao_reports').select('id').eq('school_id', schoolId).eq('status', 'PUBLICADO'),
        supabase.from('mitigacao_report_reads').select('report_id').eq('family_user_id', currentUser.id),
      ]);
      if (cancelled) return;
      if (reportsRes.error || readsRes.error) return;

      const readIds = new Set((readsRes.data || []).map(r => r.report_id));
      const unread = (reportsRes.data || []).filter(r => !readIds.has(r.id)).length;
      setMitigacaoUnread(unread);
    })();

    return () => { cancelled = true; };
  }, [currentSchool?.id, currentUser?.id, familyTab]);

  // Os alunos já vêm filtrados corretamente do App.jsx (via student_guardians ou family_id)
  const familyStudents = students;

  // Estados dos Accordions
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => {
    setOpenAccordion(openAccordion === name ? null : name);
  };

  // Controla o expandir/recolher da sidebar no desktop via estado (não só
  // :hover do CSS) — assim dá pra forçar o recolhimento ao clicar em um
  // item, mesmo que o mouse ainda esteja em cima do menu.
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const go = (tab) => {
    setFamilyTab(tab);
    registerClick(tab);
    setIsMobileMenuOpen(false);
    setIsSidebarExpanded(false);
  };

  const features = currentSchool?.features_enabled || {};

  // Dois grupos de flag por design: os módulos "core" (existiam antes do sistema
  // de features_enabled) ficam ligados por padrão e só somem se explicitamente
  // desativados (!== false); os módulos novos, adicionados depois, ficam
  // desligados por padrão até o developer contratá-los pra escola (=== true).
  const showGerenciamento = features.gerenciamento !== false;
  const showCheckin = features.checkin !== false;
  const showConfiguracoes = features.configuracoes !== false;

  const showFormularios = features.formularios === true;
  const showCalendario = features.calendario === true;
  const showComunicados = features.comunicados === true;
  const showMural = features.mural === true;
  const showCardapio = features.cardapio === true;
  const showRelatorios = features.relatorios_pedagogicos === true;
  const showChat = features.chat === true;
  const { count: chatUnreadCount, refresh: refreshChatUnread } = useChatUnreadCount(currentUser, showChat);

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
            <SidebarItem active={familyTab === 'home'} icon={Home} label="Início" onClick={() => go('home')} />

            {/* FORMULÁRIOS */}
            {showFormularios && (
              <SidebarGroup
                label="Formulários"
                icon={FileText}
                isOpen={openAccordion === 'formularios'}
                onToggle={() => toggleAccordion('formularios')}
              >
                <SidebarItem active={familyTab === 'matriculas'} icon={FileText} label="Matrículas" onClick={() => go('matriculas')} />
                <SidebarItem active={familyTab === 'ficha-medica'} icon={HeartPulse} label="Ficha Médica" onClick={() => go('ficha-medica')} />
              </SidebarGroup>
            )}

            {/* GERENCIAMENTO */}
            {showGerenciamento && (
              <SidebarGroup
                label="Gerenciamento"
                icon={Folders}
                isOpen={openAccordion === 'gerenciamento'}
                onToggle={() => toggleAccordion('gerenciamento')}
              >
                <SidebarItem active={familyTab === 'gerenciar-responsaveis'} icon={Users} label="Responsáveis" onClick={() => go('gerenciar-responsaveis')} />
                <SidebarItem active={familyTab === 'registration'} icon={ClipboardList} label="Dados Cadastrais" onClick={() => go('registration')} />
              </SidebarGroup>
            )}

            {/* CHECK-IN/OUT */}
            {showCheckin && (
              <SidebarGroup
                label="Check-in/out"
                icon={ShieldCheck}
                isOpen={openAccordion === 'checkin'}
                onToggle={() => toggleAccordion('checkin')}
              >
                <SidebarItem active={familyTab === 'acompanhamento'} icon={ShieldCheck} label="Acompanhamento" onClick={() => go('acompanhamento')} />
                <SidebarItem active={familyTab === 'authorized'} icon={QrCode} label="Autorizados" onClick={() => go('authorized')} />
                <SidebarItem active={familyTab === 'history'} icon={ClipboardList} label="Histórico Geral" onClick={() => go('history')} />
              </SidebarGroup>
            )}

            {/* RELATÓRIOS */}
            {showRelatorios && (
              <SidebarGroup
                label="Relatórios"
                icon={FileText}
                badge={mitigacaoUnread > 0 ? mitigacaoUnread : null}
                isOpen={openAccordion === 'relatorios'}
                onToggle={() => toggleAccordion('relatorios')}
              >
                {FAMILY_RELATORIOS_SUBMENU.map(r => (
                  <SidebarItem
                    key={r.key}
                    active={familyTab === r.key}
                    icon={FileText}
                    label={r.label}
                    badge={r.key === 'rel-mitigacao' && mitigacaoUnread > 0 ? mitigacaoUnread : null}
                    onClick={() => go(r.key)}
                  />
                ))}
              </SidebarGroup>
            )}

            {/* ACADÊMICO */}
            {(showCalendario || showComunicados || showMural || showCardapio) && (
              <SidebarGroup
                label="Acadêmico"
                icon={CalendarDays}
                isOpen={openAccordion === 'academico'}
                onToggle={() => toggleAccordion('academico')}
              >
                {showCalendario && (
                  <SidebarItem active={familyTab === 'calendario'} icon={CalendarDays} label="Calendário Escolar" onClick={() => go('calendario')} />
                )}
                {showComunicados && (
                  <SidebarItem active={familyTab === 'comunicados'} icon={Bell} label="Comunicados" onClick={() => go('comunicados')} />
                )}
                {showMural && (
                  <SidebarItem active={familyTab === 'mural-fotos'} icon={ImageIcon} label="Mural de Fotos" onClick={() => go('mural-fotos')} />
                )}
                {showCardapio && (
                  <SidebarItem active={familyTab === 'cardapio'} icon={UtensilsCrossed} label="Cardápio" onClick={() => go('cardapio')} />
                )}
              </SidebarGroup>
            )}

            {showConfiguracoes && (
              <SidebarItem active={familyTab === 'settings'} icon={Settings} label="Configurações" onClick={() => go('settings')} />
            )}
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
        
        {/* BANNER NOTIFICAÇÕES PUSH */}
        {pushData.permission === 'default' && !pushData.isSubscribed && !dismissedPush && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-3 justify-between shrink-0">
            <div className="flex items-center gap-2 text-amber-800 text-sm font-medium min-w-0 flex-1">
              <Bell size={18} className="text-amber-600 shrink-0" />
              <span className="truncate">Ative as notificações para receber avisos de check-in</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={pushData.subscribe} disabled={pushData.isLoading} className="text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                Ativar
              </button>
              <button onClick={dismissPushBanner} className="text-amber-500 hover:text-amber-700 p-1 rounded-md hover:bg-amber-100 transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {familyTab === 'home' && <FamilyInicio currentUser={currentUser} currentSchool={currentSchool} setFamilyTab={setFamilyTab} registerClick={registerClick} clickCounts={clickCounts} unreadNotifications={comunicadosUnread} />}

        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>}>
          {/* REUTILIZANDO COMPONENTES EXISTENTES */}
          {familyTab === 'acompanhamento' && <FamilyHome currentUser={currentUser} familyStudents={familyStudents} updateStudentStatus={updateStudentStatus} />}
          {familyTab === 'authorized' && <FamilyAuthorized authorized={authorized} togglePhoto={togglePhoto} onOpenAuthModal={onOpenAuthModal} currentSchool={currentSchool} />}
          {familyTab === 'gerenciar-responsaveis' && <FamilyGerenciarResponsaveis currentUser={currentUser} familyStudents={familyStudents} currentSchool={currentSchool} />}
          {familyTab === 'history' && <FamilyHistory currentUser={currentUser} familyStudents={familyStudents} />}
          {familyTab === 'registration' && <FamilyRegistrationData currentUser={currentUser} />}

          {/* NOVOS PLACEHOLDERS */}
          {familyTab === 'matriculas' && <FamilyMatriculas currentUser={currentUser} currentSchool={currentSchool} />}
          {familyTab === 'ficha-medica' && <FamilyFichaMedica currentUser={currentUser} currentSchool={currentSchool} familyStudents={familyStudents} />}
          {familyTab === 'calendario' && <FamilyCalendario currentUser={currentUser} currentSchool={currentSchool} />}
          {familyTab === 'comunicados' && <FamilyComunicados currentUser={currentUser} currentSchool={currentSchool} />}
          {familyTab === 'mural-fotos' && <FamilyMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}
          {familyTab === 'cardapio' && <FamilyCardapio currentUser={currentUser} currentSchool={currentSchool} />}
          {familyTab === 'rel-mitigacao' && <FamilyMitigacao currentUser={currentUser} currentSchool={currentSchool} />}
          {FAMILY_RELATORIOS_SUBMENU.filter(r => r.key !== 'rel-mitigacao').map(r => familyTab === r.key && (
            <FamilyRelatorioPlaceholder key={r.key} title={r.label} />
          ))}
          {familyTab === 'settings' && (
            <FamilySettings
              currentUser={currentUser}
              setCurrentUser={setCurrentUser}
              authorized={authorized}
              togglePhoto={togglePhoto}
              onOpenAuthModal={onOpenAuthModal}
              currentSchool={currentSchool}
              pushData={pushData}
            />
          )}
        </Suspense>
      </main>

      {/* Chat flutuante — acessível de qualquer aba, canto inferior direito */}
      {showChat && createPortal(
        <>
          <button
            onClick={() => {
              setIsChatOpen(o => !o);
              setIsChatExpanded(false);
              if (isChatOpen) refreshChatUnread();
            }}
            className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-primary hover:bg-primary-container text-white shadow-xl flex items-center justify-center transition-all active:scale-95"
            title="Chat"
          >
            {isChatOpen ? <X size={24} /> : <MessageCircle size={24} />}
            {!isChatOpen && chatUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
                {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
              </span>
            )}
          </button>
          {isChatOpen && (
            <div className={`fixed z-40 border border-outline-variant shadow-2xl overflow-hidden bg-surface-container-lowest animate-in fade-in duration-200 inset-3 ${
              isChatExpanded
                ? 'sm:inset-6 rounded-zela-xl'
                : 'sm:inset-auto sm:bottom-24 sm:right-5 sm:w-96 sm:h-[70vh] sm:max-h-[600px] rounded-zela-xl slide-in-from-bottom-4'
            }`}>
              <button
                onClick={() => setIsChatExpanded(e => !e)}
                className="hidden sm:block absolute top-4 right-4 z-10 p-1.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-zela-sm transition"
                title={isChatExpanded ? 'Recolher' : 'Expandir'}
              >
                {isChatExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <Suspense fallback={<div className="h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
                <FamilyChat currentUser={currentUser} currentSchool={currentSchool} />
              </Suspense>
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}
