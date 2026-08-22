import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Car, Clock, Bell, ShieldCheck, KeyRound, Users, CalendarDays, Settings, Monitor, Camera, ShieldHalf, Smartphone, Home, ChevronDown, FolderPlus, Folders, FileText, Image as ImageIcon, UtensilsCrossed, Calendar, MessageCircle, X, Maximize2, Minimize2 } from 'lucide-react';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import AdminInicio from './AdminInicio';
import LoadingLogo from './LoadingLogo';
import { preloadFaceModels } from '../lib/faceModels';
import CheckinAlertModal from './CheckinAlertModal';

// Lazy: cada tela só entra no bundle quando o admin realmente abre aquela aba
// — reduz bastante o carregamento inicial do painel (dezenas de telas, a
// maioria acessada só ocasionalmente).
const AdminMatriculas = lazy(() => import('./AdminMatriculas'));
const AdminFichaMedica = lazy(() => import('./AdminFichaMedica'));
const AdminCalendario = lazy(() => import('./AdminCalendario'));
const AdminMuralFotos = lazy(() => import('./AdminMuralFotos'));
const AdminCardapio = lazy(() => import('./AdminCardapio'));
const AdminChat = lazy(() => import('./AdminChat'));
const AdminCadastroFuncionarios = lazy(() => import('./AdminCadastroFuncionarios'));
const AdminGerenciarFuncionarios = lazy(() => import('./AdminGerenciarFuncionarios'));
const AdminCadastroComunicados = lazy(() => import('./AdminCadastroComunicados'));
const AdminUserRegistration = lazy(() => import('./AdminUserRegistration'));
const AdminUserManagement = lazy(() => import('./AdminUserManagement'));
const AdminDailyPresence = lazy(() => import('./AdminDailyPresence'));
const AdminStudentList = lazy(() => import('./AdminStudentList'));
const AdminFaceScanner = lazy(() => import('./AdminFaceScanner'));
const AdminPasswordLogin = lazy(() => import('./AdminPasswordLogin'));
const AdminHistory = lazy(() => import('./AdminHistory'));
const AdminSettings = lazy(() => import('./AdminSettings'));
const AdminRelatorioHorasExtras = lazy(() => import('./AdminRelatorioHorasExtras'));
const AdminRelatorioPlaceholder = lazy(() => import('./AdminRelatorioPlaceholder'));

// Submenus do menu Relatórios — cada um vira sua própria tela conforme for
// implementado; por enquanto todos apontam para o placeholder "em construção".
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-obs-normalizacao', label: 'Observação de Normalização' },
  { key: 'rel-obs-concentracao', label: 'Observação de Concentração' },
  { key: 'rel-mapa-habilidades', label: 'Mapa de Habilidades' },
  { key: 'rel-semestral', label: 'Semestral' },
];

export default function AdminPortal({ currentUser, currentSchool, students, adminTab, setAdminTab, updateStudentStatus, rejectStudentStatus, requestKioskAccess, onUpdateSchool, isMobileMenuOpen, setIsMobileMenuOpen, onLogout, pendingAlert, onDismissAlert, onGoToMonitor }) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);

  const monitorStudents = students.filter(s => ['pending_entry', 'pending_exit'].includes(s.status));
  const prevMonitorCount = useRef(monitorStudents.length);
  const [newArrival, setNewArrival] = useState(false);
  const [isFaceScannerOpen, setIsFaceScannerOpen] = useState(false);
  const [isPasswordLoginOpen, setIsPasswordLoginOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);

  // Estados dos Accordions
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => {
    setOpenAccordion(openAccordion === name ? null : name);
  };

  const features = currentSchool?.features_enabled || {};
  const localPrefs = JSON.parse(localStorage.getItem(`admin_menu_prefs_${currentSchool?.id}`) || '{}');

  const showCadastros = features.cadastros !== false && localPrefs.cadastros !== false;
  const showGerenciamento = features.gerenciamento !== false && localPrefs.gerenciamento !== false;
  const showCheckin = features.checkin !== false && localPrefs.checkin !== false;
  const showConfiguracoes = features.configuracoes !== false && localPrefs.configuracoes !== false;

  const showFormularios = features.formularios === true && localPrefs.formularios !== false;
  const showCalendario = features.calendario === true && localPrefs.calendario !== false;
  const showComunicados = features.comunicados === true && localPrefs.comunicados !== false;
  const showMural = features.mural === true && localPrefs.mural !== false;
  const showCardapio = features.cardapio === true && localPrefs.cardapio !== false;
  const showChat = features.chat === true && localPrefs.chat !== false;
  const showRelatorios = features.relatorios_pedagogicos === true && localPrefs.relatorios_pedagogicos !== false;
  const { count: chatUnreadCount, refresh: refreshChatUnread } = useChatUnreadCount(currentUser, showChat);

  // Pré-carrega os modelos de IA em background ao montar o painel
  // Assim quando o scanner abrir, os modelos já estão na memória
  useEffect(() => {
    preloadFaceModels().catch(err => console.warn('[FaceModels] Erro no pré-carregamento:', err));
  }, []);

  // Detecta novo aluno "a caminho" via Realtime e dispara alerta visual
  useEffect(() => {
    const current = monitorStudents.length;
    if (current > prevMonitorCount.current) {
      setNewArrival(true);
      // Volta ao normal após 4 segundos
      const timer = setTimeout(() => setNewArrival(false), 4000);
      prevMonitorCount.current = current;
      return () => clearTimeout(timer);
    }
    prevMonitorCount.current = current;
  }, [monitorStudents.length]);

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
          <p className="px-3 text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-2 mt-1 shrink-0 whitespace-nowrap md:hidden md:group-hover:block">Navegação Principal</p>
          <nav className="flex-1 flex flex-col gap-0.5 min-h-0 pr-0.5 overflow-y-auto overflow-x-hidden pb-2">
            <button
              onClick={() => { setAdminTab('home'); registerClick('home'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${adminTab === 'home' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Home size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Início</span>
            </button>

            {/* Itens com submenu (accordion) sempre primeiro, depois os itens sem submenu */}

            {/* CADASTROS */}
            {showCadastros && (
              <div>
                <button
                  onClick={() => toggleAccordion('cadastros')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${['register', 'cadastro-comunicados', 'cadastro-funcionarios'].includes(adminTab) || openAccordion === 'cadastros' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><FolderPlus size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Cadastros</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'cadastros' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'cadastros' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-0.5 pl-9 pr-2 py-1 whitespace-nowrap">
                    <button onClick={() => { setAdminTab('register'); registerClick('register'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'register' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Usuários</button>
                    {showComunicados && (
                      <button onClick={() => { setAdminTab('cadastro-comunicados'); registerClick('cadastro-comunicados'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'cadastro-comunicados' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Comunicados</button>
                    )}
                    <button onClick={() => { setAdminTab('cadastro-funcionarios'); registerClick('cadastro-funcionarios'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'cadastro-funcionarios' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Funcionários</button>
                  </div>
                </div>
              </div>
            )}

            {/* GERENCIAMENTO */}
            {showGerenciamento && (
              <div>
                <button
                  onClick={() => toggleAccordion('gerenciamento')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${['users', 'students', 'gerenciar-funcionarios'].includes(adminTab) || openAccordion === 'gerenciamento' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><Folders size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Gerenciamento</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'gerenciamento' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'gerenciamento' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-0.5 pl-9 pr-2 py-1 whitespace-nowrap">
                    <button onClick={() => { setAdminTab('users'); registerClick('users'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'users' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Usuários</button>
                    <button onClick={() => { setAdminTab('students'); registerClick('students'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'students' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Alunos</button>
                    <button onClick={() => { setAdminTab('gerenciar-funcionarios'); registerClick('gerenciar-funcionarios'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'gerenciar-funcionarios' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Funcionários</button>
                  </div>
                </div>
              </div>
            )}

            {/* FORMULÁRIOS */}
            {showFormularios && (
              <div>
                <button
                  onClick={() => toggleAccordion('formularios')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${['matriculas', 'ficha-medica'].includes(adminTab) || openAccordion === 'formularios' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><FileText size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Formulários</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'formularios' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'formularios' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-0.5 pl-9 pr-2 py-1 whitespace-nowrap">
                    <button onClick={() => { setAdminTab('matriculas'); registerClick('matriculas'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'matriculas' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Matrículas</button>
                    <button onClick={() => { setAdminTab('ficha-medica'); registerClick('ficha-medica'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'ficha-medica' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Ficha Médica</button>
                  </div>
                </div>
              </div>
            )}

            {/* CHECK-IN/OUT */}
            {showCheckin && (
              <div>
                <button
                  onClick={() => toggleAccordion('checkin')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${['monitor', 'presence', 'history', 'kiosk', 'horas-extras'].includes(adminTab) || openAccordion === 'checkin' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><ShieldCheck size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Check-in/out</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'checkin' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'checkin' ? 'max-h-60' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-0.5 pl-9 pr-2 py-1 whitespace-nowrap">
                    <button onClick={() => { setAdminTab('monitor'); registerClick('monitor'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 flex items-center justify-between ${adminTab === 'monitor' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                      Monitor
                      {monitorStudents.length > 0 && (
                        <span className="bg-amber-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center animate-pulse">{monitorStudents.length}</span>
                      )}
                    </button>
                    <button onClick={() => { setAdminTab('kiosk'); registerClick('kiosk'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'kiosk' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Autoatendimento</button>
                    <button onClick={() => { setAdminTab('presence'); registerClick('presence'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'presence' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Presença Diária</button>
                    <button onClick={() => { setAdminTab('history'); registerClick('history'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'history' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Histórico Geral</button>
                    <button onClick={() => { setAdminTab('horas-extras'); registerClick('horas-extras'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === 'horas-extras' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Horas Extras</button>
                  </div>
                </div>
              </div>
            )}

            {/* RELATÓRIOS PEDAGÓGICOS */}
            {showRelatorios && (
              <div>
                <button
                  onClick={() => toggleAccordion('relatorios')}
                  className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${RELATORIOS_SUBMENU.some(r => r.key === adminTab) || openAccordion === 'relatorios' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><FileText size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Relatórios</span></div>
                  <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'relatorios' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'relatorios' ? 'max-h-60' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-0.5 pl-9 pr-2 py-1 whitespace-nowrap">
                    {RELATORIOS_SUBMENU.map(r => (
                      <button key={r.key} onClick={() => { setAdminTab(r.key); registerClick(r.key); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1 ${adminTab === r.key ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CALENDÁRIO ESCOLAR */}
            {showCalendario && (
              <button
                onClick={() => { setAdminTab('calendario'); registerClick('calendario'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${adminTab === 'calendario' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <CalendarDays size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Calendário</span>
              </button>
            )}

            {/* MURAL DE FOTOS */}
            {showMural && (
              <button
                onClick={() => { setAdminTab('mural-fotos'); registerClick('mural-fotos'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${adminTab === 'mural-fotos' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <ImageIcon size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Mural de Fotos</span>
              </button>
            )}

            {/* CARDÁPIO */}
            {showCardapio && (
              <button
                onClick={() => { setAdminTab('cardapio'); registerClick('cardapio'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${adminTab === 'cardapio' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <UtensilsCrossed size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Cardápio</span>
              </button>
            )}
          </nav>

          {/* CONFIGURAÇÕES (Fixo no footer) */}
          {showConfiguracoes && (
            <div className="pt-2 mt-auto border-t border-slate-100 shrink-0">
              <button
                onClick={() => { setAdminTab('settings'); registerClick('settings'); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${adminTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <Settings size={17} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Configurações</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingLogo logoUrl={currentSchool?.logo_url} size={72} /></div>}>

        {/* INICIO */}
        {adminTab === 'home' && <AdminInicio currentUser={currentUser} currentSchool={currentSchool} setAdminTab={setAdminTab} registerClick={registerClick} clickCounts={clickCounts} monitorCount={monitorStudents.length} />}

        {/* NOVOS PLACEHOLDERS */}
        {adminTab === 'matriculas' && <AdminMatriculas currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'ficha-medica' && <AdminFichaMedica currentUser={currentUser} currentSchool={currentSchool} students={students} />}
        {adminTab === 'calendario' && <AdminCalendario currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'mural-fotos' && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cardapio' && <AdminCardapio currentUser={currentUser} currentSchool={currentSchool} />}
        {RELATORIOS_SUBMENU.map(r => adminTab === r.key && (
          <AdminRelatorioPlaceholder key={r.key} title={r.label} />
        ))}
        {adminTab === 'cadastro-funcionarios' && <AdminCadastroFuncionarios currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'gerenciar-funcionarios' && <AdminGerenciarFuncionarios currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cadastro-comunicados' && <AdminCadastroComunicados currentUser={currentUser} currentSchool={currentSchool} />}

        {/* MONITOR */}
        {adminTab === 'monitor' && (
          <div className={`h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border-2 transition-all duration-500 overflow-hidden ${newArrival ? 'border-amber-400 shadow-amber-100 shadow-lg' : 'border-slate-200'}`}>

            {/* Header do Monitor */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Monitor de Solicitações</h2>
                  <p className="text-sm text-slate-500">Acompanhe as solicitações em tempo real</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                {/* Removidos daqui os botões de scanner que agora ficam no Totem */}
              </div>
            </div>

            {/* Alerta de nova chegada */}
            {newArrival && (
              <div className="mb-5 p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 shrink-0">
                <Bell className="text-amber-600 shrink-0 animate-bounce" size={22} />
                <div>
                  <p className="font-bold text-amber-800">Nova atualização no painel!</p>
                  <p className="text-xs text-amber-600">Confirme a solicitação de check-in/out abaixo.</p>
                </div>
              </div>
            )}

            {/* Cards dos alunos */}
            {monitorStudents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                <Car className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <h3 className="text-slate-500 font-medium">Nenhuma solicitação no momento.</h3>
                <p className="text-slate-400 text-sm mt-1">O painel atualiza automaticamente com o totem e avisos das famílias.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {monitorStudents.map(student => {
                    let badgeClass, badgeText, btnClass, btnText, btnActionStatus, cancelStatus, borderColor, bgColor;

                    if (student.status === 'pending_entry') {
                      badgeClass = "text-green-700"; badgeText = "Solicitação de Entrada";
                      btnClass = "bg-green-600 hover:bg-green-700 text-white"; btnText = "Confirmar Entrada";
                      btnActionStatus = "in_school";
                      cancelStatus = "idle";
                      borderColor = "border-green-300"; bgColor = "bg-green-50";
                    } else if (student.status === 'pending_exit') {
                      badgeClass = "text-indigo-700"; badgeText = "Solicitação de Saída";
                      btnClass = "bg-indigo-600 hover:bg-indigo-700 text-white"; btnText = "Confirmar Saída";
                      btnActionStatus = "left";
                      cancelStatus = "in_school";
                      borderColor = "border-indigo-300"; bgColor = "bg-indigo-50";
                    }

                    return (
                      <div
                        key={student.id}
                        className={`p-5 border-2 ${borderColor} ${bgColor} rounded-2xl shadow-sm animate-in zoom-in-95 duration-300`}
                      >
                        <p className={`text-[10px] md:text-xs font-bold uppercase mb-1 flex items-center gap-1 ${badgeClass}`}>
                          <Clock size={12} /> {badgeText}
                        </p>
                        <h3 className="font-bold text-lg text-slate-800 mb-4">{student.name}</h3>
                        <div className="flex flex-col gap-2">
                          {/* Botão APROVAR: confirma o check-in/out e grava no attendance_logs */}
                          <button
                            title={student.status === 'pending_entry' ? 'Confirmar Check-in' : 'Confirmar Check-out'}
                            onClick={() => updateStudentStatus(student.id, btnActionStatus)}
                            className={`w-full font-bold py-3 rounded-xl active:scale-95 transition-all shadow-sm ${btnClass}`}
                          >
                            {btnText}
                          </button>
                          {/* Botão CANCELAR: reverte status sem gravar no attendance_logs */}
                          <button
                            title="Rejeitar solicitação"
                            onClick={() => rejectStudentStatus(student.id, cancelStatus)}
                            className="w-full font-semibold py-2 rounded-xl text-slate-500 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 active:scale-95 transition-all"
                          >
                            Cancelar Solicitação
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AUTOATENDIMENTO */}
        {adminTab === 'kiosk' && (
          <div className="h-full bg-white p-5 sm:p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center justify-center overflow-hidden">
            {/* Header */}
            <div className="text-center mb-5 sm:mb-8 shrink-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <ShieldCheck size={28} className="sm:hidden" />
                <ShieldCheck size={32} className="hidden sm:block" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 mb-1">Autoatendimento</h2>
              <p className="text-slate-500 font-medium text-sm max-w-md mx-auto">
                Identifique-se
              </p>
            </div>

            {/* Botões — sempre em linha, sem forçar altura extra, para caber sem scroll */}
            {currentSchool?.plan === 'pro' ? (
              /* Plano Pro: reconhecimento facial + senha lado a lado */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl shrink-0">
                <button
                  onClick={() => setIsFaceScannerOpen(true)}
                  className="flex flex-row items-center justify-center gap-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border-2 border-emerald-200 hover:border-emerald-600 p-5 rounded-2xl transition-all shadow-sm group"
                >
                  <Camera size={28} className="group-hover:scale-110 transition-transform shrink-0" />
                  <span className="font-black text-base sm:text-lg">Reconhecimento Facial</span>
                </button>

                <button
                  onClick={() => setIsPasswordLoginOpen(true)}
                  className="flex flex-row items-center justify-center gap-3 bg-slate-50 text-slate-700 hover:bg-slate-800 hover:text-white border-2 border-slate-200 hover:border-slate-800 p-5 rounded-2xl transition-all shadow-sm group"
                >
                  <KeyRound size={28} className="group-hover:scale-110 transition-transform shrink-0" />
                  <span className="font-black text-base sm:text-lg">Senha / PIN</span>
                </button>
              </div>
            ) : (
              /* Plano Basic: só senha (reconhecimento facial é recurso Pro) */
              <div className="grid grid-cols-1 gap-3 w-full max-w-md shrink-0">
                <button
                  onClick={() => setIsPasswordLoginOpen(true)}
                  className="flex flex-row items-center justify-center gap-3 bg-slate-50 text-slate-700 hover:bg-slate-800 hover:text-white border-2 border-slate-200 hover:border-slate-800 p-5 rounded-2xl transition-all shadow-sm group"
                >
                  <KeyRound size={28} className="group-hover:scale-110 transition-transform shrink-0" />
                  <span className="font-black text-base sm:text-lg">Senha / PIN</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* PRESENÇA */}
        {adminTab === 'presence' && <AdminDailyPresence currentUser={currentUser} />}

        {/* GESTÃO */}
        {adminTab === 'users' && <AdminUserManagement currentUser={currentUser} />}

        {/* LISTA DE ALUNOS */}
        {adminTab === 'students' && <AdminStudentList currentUser={currentUser} />}

        {/* HISTÓRICO */}
        {adminTab === 'history' && <AdminHistory currentSchool={currentSchool} />}

        {/* HORAS EXTRAS */}
        {adminTab === 'horas-extras' && <AdminRelatorioHorasExtras currentSchool={currentSchool} />}

        {/* CADASTRO */}
        {adminTab === 'register' && <AdminUserRegistration currentUser={currentUser} />}

        {/* CONFIGURAÇÕES */}
        {adminTab === 'settings' && <AdminSettings currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} />}
      </Suspense>

        {/* Face Scanner Modal */}
        {isFaceScannerOpen && createPortal(
          <Suspense fallback={null}>
            <AdminFaceScanner
              onClose={() => setIsFaceScannerOpen(false)}
              updateStudentStatus={updateStudentStatus}
              requestKioskAccess={requestKioskAccess}
              students={students}
              currentUser={currentUser}
            />
          </Suspense>,
          document.body
        )}

        {/* Password Login Modal */}
        {isPasswordLoginOpen && createPortal(
          <Suspense fallback={null}>
            <AdminPasswordLogin
              onClose={() => setIsPasswordLoginOpen(false)}
              updateStudentStatus={updateStudentStatus}
              requestKioskAccess={requestKioskAccess}
              currentUser={currentUser}
            />
          </Suspense>,
          document.body
        )}

        {/* Alerta de Check-in/Check-out — overlay em qualquer aba do Admin */}
        {pendingAlert && createPortal(
          <CheckinAlertModal
            alert={pendingAlert}
            onDismiss={onDismissAlert}
            onGoToMonitor={onGoToMonitor}
          />,
          document.body
        )}

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
                <Suspense fallback={<div className="flex items-center justify-center h-full"><LoadingLogo logoUrl={currentSchool?.logo_url} size={56} /></div>}>
                  <AdminChat currentUser={currentUser} currentSchool={currentSchool} />
                </Suspense>
              </div>
            )}
          </>,
          document.body
        )}
      </main>
    </div>
  );
}
