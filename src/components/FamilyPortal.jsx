import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Home, CalendarDays, Settings, QrCode, Users, HeartPulse, ClipboardList, ChevronDown, FolderPlus, Folders, FileText, Bell, Image as ImageIcon, UtensilsCrossed, ShieldCheck, X, MessageCircle, Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import { usePushNotifications } from '../hooks/usePushNotifications';
import FamilyInicio from './FamilyInicio';

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

// Submenus do menu Relatórios visíveis para a família — só os relatórios que
// a escola de fato compartilha com os responsáveis (os demais, como
// Observação de Normalização/Concentração e Mapa de Habilidades, são de uso
// interno da equipe pedagógica e nunca aparecem aqui).
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

  // Os alunos já vêm filtrados corretamente do App.jsx (via student_guardians ou family_id)
  const familyStudents = students;

  // Estados dos Accordions
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => {
    setOpenAccordion(openAccordion === name ? null : name);
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

      {/* Espaçador: reserva a largura recolhida (ícones) no fluxo do layout,
          enquanto o <aside> real flutua por cima ao expandir no hover */}
      <div className="hidden md:block md:w-16 shrink-0" aria-hidden="true"></div>

      <aside
        onMouseLeave={() => setOpenAccordion(null)}
        className={`group fixed md:absolute top-0 left-0 h-[100dvh] md:h-full w-64 md:w-16 md:hover:w-52 shrink-0 z-20 md:z-30 transform transition-all duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-full bg-white p-3 pt-[68px] md:pt-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-200 flex flex-col overflow-y-auto overflow-x-hidden">
          <p className="px-3 text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-3 mt-2 shrink-0 whitespace-nowrap md:hidden md:group-hover:block">Navegação Principal</p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 pr-0.5 overflow-y-auto overflow-x-hidden pb-4">
            {/* INÍCIO */}
            <button
              onClick={() => { setFamilyTab('home'); registerClick('home'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${familyTab === 'home' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Home size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Início</span>
            </button>

            {/* FORMULÁRIOS */}
            {showFormularios && (
              <div>
                <button
                  onClick={() => toggleAccordion('formularios')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['matriculas', 'ficha-medica'].includes(familyTab) || openAccordion === 'formularios' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><FileText size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Formulários</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'formularios' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'formularios' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1 whitespace-nowrap">
                    <button onClick={() => { setFamilyTab('matriculas'); registerClick('matriculas'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'matriculas' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Matrículas</button>
                    <button onClick={() => { setFamilyTab('ficha-medica'); registerClick('ficha-medica'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'ficha-medica' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Ficha Médica</button>
                  </div>
                </div>
              </div>
            )}

            {/* GERENCIAMENTO */}
            {showGerenciamento && (
              <div>
                <button
                  onClick={() => toggleAccordion('gerenciamento')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['gerenciar-responsaveis', 'registration'].includes(familyTab) || openAccordion === 'gerenciamento' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><Folders size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Gerenciamento</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'gerenciamento' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'gerenciamento' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1 whitespace-nowrap">
                    <button onClick={() => { setFamilyTab('gerenciar-responsaveis'); registerClick('gerenciar-responsaveis'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'gerenciar-responsaveis' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Gerenciar Responsáveis</button>
                    <button onClick={() => { setFamilyTab('registration'); registerClick('registration'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'registration' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Dados Cadastrais</button>
                  </div>
                </div>
              </div>
            )}

            {/* CHECK-IN/OUT */}
            {showCheckin && (
              <div>
                <button
                  onClick={() => toggleAccordion('checkin')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['acompanhamento', 'authorized', 'history'].includes(familyTab) || openAccordion === 'checkin' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><ShieldCheck size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Check-in/out</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'checkin' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'checkin' ? 'max-h-60' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1 whitespace-nowrap">
                    <button onClick={() => { setFamilyTab('acompanhamento'); registerClick('acompanhamento'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'acompanhamento' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Acompanhamento Diário</button>
                    <button onClick={() => { setFamilyTab('authorized'); registerClick('authorized'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'authorized' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Autorizados</button>
                    <button onClick={() => { setFamilyTab('history'); registerClick('history'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'history' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Histórico Geral</button>
                  </div>
                </div>
              </div>
            )}

            {/* CALENDÁRIO ESCOLAR */}
            {showCalendario && (
              <button
                onClick={() => { setFamilyTab('calendario'); registerClick('calendario'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${familyTab === 'calendario' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <CalendarDays size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Calendário Escolar</span>
              </button>
            )}

            {/* COMUNICADOS */}
            {showComunicados && (
              <button
                onClick={() => { setFamilyTab('comunicados'); registerClick('comunicados'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${familyTab === 'comunicados' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <Bell size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Comunicados</span>
              </button>
            )}

            {/* MURAL DE FOTOS */}
            {showMural && (
              <button
                onClick={() => { setFamilyTab('mural-fotos'); registerClick('mural-fotos'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${familyTab === 'mural-fotos' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <ImageIcon size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Mural de Fotos</span>
              </button>
            )}

            {/* CARDÁPIO */}
            {showCardapio && (
              <button
                onClick={() => { setFamilyTab('cardapio'); registerClick('cardapio'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${familyTab === 'cardapio' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <UtensilsCrossed size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Cardápio</span>
              </button>
            )}

            {/* RELATÓRIOS */}
            {showRelatorios && (
              <div>
                <button
                  onClick={() => toggleAccordion('relatorios')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${FAMILY_RELATORIOS_SUBMENU.some(r => r.key === familyTab) || openAccordion === 'relatorios' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><FileText size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Relatórios</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'relatorios' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'relatorios' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1 whitespace-nowrap">
                    {FAMILY_RELATORIOS_SUBMENU.map(r => (
                      <button key={r.key} onClick={() => { setFamilyTab(r.key); registerClick(r.key); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === r.key ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </nav>

          {showConfiguracoes && (
            <div className="pt-4 mt-auto border-t border-slate-100 shrink-0">
              <button
                onClick={() => { setFamilyTab('settings'); registerClick('settings'); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${familyTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <Settings size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Configurações</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
        
        {/* BANNER NOTIFICAÇÕES PUSH */}
        {pushData.permission === 'default' && !pushData.isSubscribed && !dismissedPush && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
              <Bell size={18} className="text-amber-600" />
              <span className="truncate">Ative as notificações para receber avisos de check-in</span>
            </div>
            <div className="flex items-center gap-2">
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

        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div></div>}>
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
          {FAMILY_RELATORIOS_SUBMENU.map(r => familyTab === r.key && (
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
            className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center justify-center transition-all active:scale-95"
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
            <div className={`fixed z-40 border border-slate-200 shadow-2xl overflow-hidden bg-white animate-in fade-in duration-200 ${
              isChatExpanded
                ? 'inset-3 sm:inset-6 rounded-3xl'
                : 'bottom-24 right-5 w-[calc(100vw-2.5rem)] max-w-sm h-[70vh] max-h-[600px] sm:w-96 rounded-3xl slide-in-from-bottom-4'
            }`}>
              <button
                onClick={() => setIsChatExpanded(e => !e)}
                className="absolute top-4 right-4 z-10 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                title={isChatExpanded ? 'Recolher' : 'Expandir'}
              >
                {isChatExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <Suspense fallback={<div className="h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
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
