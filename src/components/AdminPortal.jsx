import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Car, Clock, Bell, ShieldCheck, KeyRound, Users, CalendarDays, Settings, Camera, Smartphone, Home, FolderPlus, Folders, FileText, Image as ImageIcon, UtensilsCrossed, MessageCircle, X, Maximize2, Minimize2, ScrollText, Megaphone, BookOpen, BookMarked, ClipboardCheck, Wallet, CheckCheck, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import { usePendingUsersCount } from '../hooks/usePendingUsersCount';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useSchoolConfig } from '../lib/schoolConfig';
import AdminInicio from './AdminInicio';
import LoadingLogo from './LoadingLogo';
import { preloadFaceModels } from '../lib/faceModels';
import CheckinAlertModal from './CheckinAlertModal';
import ConfirmExitPassword from './ConfirmExitPassword';
import { SidebarItem, SidebarGroup } from './SidebarNav';

// Lazy: cada tela só entra no bundle quando o admin realmente abre aquela aba
// — reduz bastante o carregamento inicial do painel (dezenas de telas, a
// maioria acessada só ocasionalmente).
const AdminMatriculas = lazy(() => import('./AdminMatriculas'));
const AdminFichaMedica = lazy(() => import('./AdminFichaMedica'));
const AdminCalendario = lazy(() => import('./AdminCalendario'));
const AdminMuralFotos = lazy(() => import('./AdminMuralFotos'));
const AdminCardapio = lazy(() => import('./AdminCardapio'));
const AdminDiario = lazy(() => import('./AdminDiario'));
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
const AdminMitigacao = lazy(() => import('./AdminMitigacao'));
const AdminAuditLog = lazy(() => import('./AdminAuditLog'));
const AdminFaceEnrollment = lazy(() => import('./AdminFaceEnrollment'));
const AdminFinanceiro = lazy(() => import('./AdminFinanceiro'));
const AdminSubjects = lazy(() => import('./AdminSubjects'));
const AdminFrequencia = lazy(() => import('./AdminFrequencia'));
const AdminAttendanceCorrections = lazy(() => import('./AdminAttendanceCorrections'));

// Submenus do menu Relatórios — cada um vira sua própria tela conforme for
// implementado; por enquanto todos apontam para o placeholder "em construção".
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-mapa-habilidades', label: 'Mapa de Habilidades' },
  { key: 'rel-semestral', label: 'Semestral' },
];

export default function AdminPortal({ currentUser, currentSchool, students, adminTab, setAdminTab, updateStudentStatus, rejectStudentStatus, requestKioskAccess, authorized, togglePhoto, onUpdateSchool, isMobileMenuOpen, setIsMobileMenuOpen, pendingAlert, onDismissAlert, onGoToMonitor }) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);
  const { count: pendingUsersCount } = usePendingUsersCount(currentUser);
  const pushData = usePushNotifications(currentUser, currentSchool);
  const [dismissedPush, setDismissedPush] = useState(
    localStorage.getItem(`zela_push_dismissed_${currentUser?.id}`) === 'true'
  );
  const dismissPushBanner = () => {
    localStorage.setItem(`zela_push_dismissed_${currentUser?.id}`, 'true');
    setDismissedPush(true);
  };
  // Permite ao card de "cadastros pendentes" (AdminInicio) pular direto
  // pra aba Pendentes de Usuários, em vez de só abrir a tela na aba
  // padrão (Ativos) e deixar o admin procurar.
  const [usersInitialTab, setUsersInitialTab] = useState('active');
  const goToPendingUsers = () => {
    setUsersInitialTab('pending');
    go('users');
  };

  const monitorStudents = students.filter(s => ['pending_entry', 'pending_exit'].includes(s.status));
  const prevMonitorCount = useRef(monitorStudents.length);
  const [newArrival, setNewArrival] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [pendingCorrectionsCount, setPendingCorrectionsCount] = useState(0);

  // Badge de correções de presença aguardando aprovação — mesmo padrão do
  // badge do Monitor, mas via contagem no banco (não deriva de `students`).
  // Realtime evita precisar trocar de aba pra ver o número atualizar quando
  // outro admin solicita ou resolve uma correção.
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
      .channel(`attendance-corrections-badge-${currentUser.school_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_corrections', filter: `school_id=eq.${currentUser.school_id}` }, refreshCount)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUser?.school_id]);

  // Aprova de uma vez todas as solicitações pendentes do Monitor, na ordem em
  // que aparecem. Vai uma a uma (sequencial) de propósito: updateStudentStatus
  // grava em attendance_logs e atualiza estado/realtime a cada chamada, então
  // disparar tudo em paralelo abriria brecha pra corrida de status.
  const handleApproveAll = async () => {
    if (bulkApproving || monitorStudents.length === 0) return;
    setBulkApproving(true);
    try {
      // Congela a lista no início: o array muda conforme cada aprovação
      // remove o aluno de monitorStudents.
      const pendentes = [...monitorStudents];
      for (const student of pendentes) {
        const target = student.status === 'pending_entry' ? 'in_school' : 'left';
        try {
          await updateStudentStatus(student.id, target);
        } catch (err) {
          console.error(`Falha ao aprovar solicitação de ${student.name}:`, err);
        }
      }
    } finally {
      setBulkApproving(false);
    }
  };
  const [isFaceScannerOpen, setIsFaceScannerOpen] = useState(false);
  const [isPasswordLoginOpen, setIsPasswordLoginOpen] = useState(false);
  const [isFaceEnrollmentOpen, setIsFaceEnrollmentOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);

  // Estados dos Accordions
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => {
    setOpenAccordion(openAccordion === name ? null : name);
  };

  // Controla o expandir/recolher da sidebar no desktop via estado (não só
  // :hover do CSS) — assim dá pra forçar o recolhimento ao clicar em um
  // item, mesmo que o mouse ainda esteja em cima do menu.
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  // A senha só é exigida pra SAIR do Autoatendimento pra qualquer outro menu
  // (a tela fica exposta pra qualquer pessoa durante o check-in) — não mais
  // pra fechar a tela de biometria/PIN em si, que agora fecha direto no X
  // (ver AdminFaceScanner.jsx / AdminPasswordLogin.jsx).
  const [kioskExitTarget, setKioskExitTarget] = useState(null);
  const applyTabChange = (tab) => {
    setAdminTab(tab);
    registerClick(tab);
    setIsMobileMenuOpen(false);
    setIsSidebarExpanded(false);
  };
  const go = (tab) => {
    if (adminTab === 'kiosk' && tab !== 'kiosk') {
      setKioskExitTarget(tab);
      return;
    }
    applyTabChange(tab);
  };
  const confirmKioskExit = () => {
    const tab = kioskExitTarget;
    setKioskExitTarget(null);
    if (tab) applyTabChange(tab);
  };

  const features = currentSchool?.features_enabled || {};
  const { terminology } = useSchoolConfig(currentSchool?.id || currentUser?.school_id);
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
  const showDiario = features.diario === true && localPrefs.diario !== false;
  const showChat = features.chat === true && localPrefs.chat !== false;
  const showRelatorios = features.relatorios_pedagogicos === true && localPrefs.relatorios_pedagogicos !== false;
  const showFinanceiro = features.financeiro === true && localPrefs.financeiro !== false;
  const showMaterias = features.materias === true && localPrefs.materias !== false;
  const showFrequencia = features.frequencia === true && localPrefs.frequencia !== false;
  const { count: chatUnreadCount, refresh: refreshChatUnread } = useChatUnreadCount(currentUser, showChat);

  // Pré-carrega os modelos de IA (~12,6MB) em background só quando o admin
  // abre a aba Autoatendimento (onde o Scanner/Cadastro de Foto realmente
  // vivem) — não no mount do painel inteiro. Antes disso disparava pra
  // QUALQUER admin de escola com check-in habilitado assim que o painel
  // abria, mesmo que a sessão nunca chegasse perto do totem; a maioria das
  // sessões de admin (cadastro, relatórios, cardápio...) nunca precisa
  // desses ~12,6MB. Escopar ao tab certo é o que efetivamente torna esse
  // carregamento "sob demanda" — o preload em si continua valendo: quando a
  // pessoa abre Autoatendimento, o modelo já está esquentando antes de ela
  // clicar em "Escanear".
  useEffect(() => {
    if (!showCheckin || adminTab !== 'kiosk') return;
    preloadFaceModels().catch(err => console.warn('[FaceModels] Erro no pré-carregamento:', err));
  }, [showCheckin, adminTab]);

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

      <aside
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:sticky top-[60px] md:top-16 left-0 h-[calc(100dvh-60px)] md:h-[calc(100dvh-4rem)] w-72 shrink-0 z-20 md:z-auto bg-surface-container-low border-r border-outline-variant transform transition-all duration-300 ease-in-out md:translate-x-0 overflow-hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarExpanded ? 'md:w-[280px]' : 'md:w-16'}`}
      >
        <div className="h-full flex flex-col min-h-0">
          <nav className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2 space-y-1">
            <SidebarItem active={adminTab === 'home'} icon={Home} label="Início" onClick={() => go('home')} />

            {/* CADASTROS */}
            {showCadastros && (
              <SidebarGroup
                label="Cadastros"
                icon={FolderPlus}
                isOpen={openAccordion === 'cadastros'}
                onToggle={() => toggleAccordion('cadastros')}
              >
                <SidebarItem active={adminTab === 'register'} icon={FolderPlus} label="Usuários" onClick={() => go('register')} />
                <SidebarItem active={adminTab === 'cadastro-funcionarios'} icon={Users} label="Funcionários" onClick={() => go('cadastro-funcionarios')} />
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
                <SidebarItem active={adminTab === 'users'} icon={Folders} label="Usuários" badge={pendingUsersCount > 0 ? pendingUsersCount : null} onClick={() => go('users')} />
                <SidebarItem active={adminTab === 'students'} icon={Users} label="Alunos" onClick={() => go('students')} />
                <SidebarItem active={adminTab === 'gerenciar-funcionarios'} icon={Users} label="Funcionários" onClick={() => go('gerenciar-funcionarios')} />
              </SidebarGroup>
            )}

            {/* FORMULÁRIOS */}
            {showFormularios && (
              <SidebarGroup
                label="Formulários"
                icon={FileText}
                isOpen={openAccordion === 'formularios'}
                onToggle={() => toggleAccordion('formularios')}
              >
                <SidebarItem active={adminTab === 'matriculas'} icon={FileText} label="Matrículas" onClick={() => go('matriculas')} />
                <SidebarItem active={adminTab === 'ficha-medica'} icon={FileText} label="Ficha Médica" onClick={() => go('ficha-medica')} />
              </SidebarGroup>
            )}

            {/* CHECK-IN/OUT */}
            {showCheckin && (
              <SidebarGroup
                label="Check-in/out"
                icon={ShieldCheck}
                badge={monitorStudents.length > 0 ? monitorStudents.length : null}
                isOpen={openAccordion === 'checkin'}
                onToggle={() => toggleAccordion('checkin')}
              >
                <SidebarItem active={adminTab === 'monitor'} icon={ShieldCheck} label="Monitor" badge={monitorStudents.length > 0 ? monitorStudents.length : null} onClick={() => go('monitor')} />
                <SidebarItem active={adminTab === 'kiosk'} icon={Smartphone} label="Autoatendimento" onClick={() => go('kiosk')} />
                <SidebarItem active={adminTab === 'presence'} icon={CalendarDays} label="Presença Diária" onClick={() => go('presence')} />
                <SidebarItem active={adminTab === 'history'} icon={ScrollText} label="Histórico Geral" onClick={() => go('history')} />
                <SidebarItem active={adminTab === 'horas-extras'} icon={Clock} label="Horas Extras" onClick={() => go('horas-extras')} />
                <SidebarItem active={adminTab === 'attendance-corrections'} icon={ClipboardCheck} label="Correções de Presença" badge={pendingCorrectionsCount > 0 ? pendingCorrectionsCount : null} onClick={() => go('attendance-corrections')} />
              </SidebarGroup>
            )}

            {/* RELATÓRIOS PEDAGÓGICOS */}
            {showRelatorios && (
              <SidebarGroup
                label="Relatórios"
                icon={FileText}
                isOpen={openAccordion === 'relatorios'}
                onToggle={() => toggleAccordion('relatorios')}
              >
                {RELATORIOS_SUBMENU.map(r => (
                  <SidebarItem key={r.key} active={adminTab === r.key} icon={FileText} label={r.label} onClick={() => go(r.key)} />
                ))}
              </SidebarGroup>
            )}

            {/* ACADÊMICO: CALENDÁRIO / MURAL / CARDÁPIO / DIÁRIO / MATÉRIAS / FREQUÊNCIA / COMUNICADOS */}
            {(showCalendario || showMural || showCardapio || showDiario || showMaterias || showFrequencia || showComunicados) && (
              <SidebarGroup
                label="Acadêmico"
                icon={CalendarDays}
                isOpen={openAccordion === 'academico'}
                onToggle={() => toggleAccordion('academico')}
              >
                {showCalendario && (
                  <SidebarItem active={adminTab === 'calendario'} icon={CalendarDays} label="Calendário" onClick={() => go('calendario')} />
                )}
                {showMural && (
                  <SidebarItem active={adminTab === 'mural-fotos'} icon={ImageIcon} label="Mural de Fotos" onClick={() => go('mural-fotos')} />
                )}
                {showCardapio && (
                  <SidebarItem active={adminTab === 'cardapio'} icon={UtensilsCrossed} label="Cardápio" onClick={() => go('cardapio')} />
                )}
                {showDiario && (
                  <SidebarItem active={adminTab === 'diario'} icon={BookOpen} label="Diário" onClick={() => go('diario')} />
                )}
                {showMaterias && (
                  <SidebarItem active={adminTab === 'materias'} icon={BookMarked} label={`${terminology.subject}s`} onClick={() => go('materias')} />
                )}
                {showFrequencia && (
                  <SidebarItem active={adminTab === 'frequencia'} icon={ClipboardCheck} label="Frequência" onClick={() => go('frequencia')} />
                )}
                {showComunicados && (
                  <SidebarItem active={adminTab === 'cadastro-comunicados'} icon={Megaphone} label="Comunicados" onClick={() => go('cadastro-comunicados')} />
                )}
              </SidebarGroup>
            )}

            {/* FINANCEIRO */}
            {showFinanceiro && (
              <SidebarItem active={adminTab === 'financeiro'} icon={Wallet} label="Financeiro" onClick={() => go('financeiro')} />
            )}

            {/* SISTEMA */}
            {showConfiguracoes && (
              <SidebarGroup
                label="Sistema"
                icon={Settings}
                isOpen={openAccordion === 'sistema'}
                onToggle={() => toggleAccordion('sistema')}
              >
                <SidebarItem active={adminTab === 'auditoria'} icon={ScrollText} label="Auditoria" onClick={() => go('auditoria')} />
                <SidebarItem active={adminTab === 'settings'} icon={Settings} label="Configurações" onClick={() => go('settings')} />
              </SidebarGroup>
            )}
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
      {/* BANNER NOTIFICAÇÕES PUSH — mesmo padrão de FamilyPortal.jsx.
          Sem isso, notifyAdmins() nunca tem pra quem mandar push (a
          escola nunca teria se inscrito). */}
      {pushData.permission === 'default' && !pushData.isSubscribed && !dismissedPush && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-3 justify-between shrink-0">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-medium min-w-0 flex-1">
            <Bell size={18} className="text-amber-600 shrink-0" />
            <span className="truncate">Ative as notificações para saber na hora quando um responsável se cadastrar</span>
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
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingLogo logoUrl={currentSchool?.logo_url} size={72} /></div>}>

        {/* INICIO */}
        {adminTab === 'home' && <AdminInicio currentUser={currentUser} currentSchool={currentSchool} setAdminTab={setAdminTab} registerClick={registerClick} clickCounts={clickCounts} monitorCount={monitorStudents.length} pendingUsersCount={pendingUsersCount} onGoToPendingUsers={goToPendingUsers} />}

        {/* NOVOS PLACEHOLDERS */}
        {adminTab === 'matriculas' && <AdminMatriculas currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'ficha-medica' && <AdminFichaMedica currentUser={currentUser} currentSchool={currentSchool} students={students} />}
        {adminTab === 'calendario' && <AdminCalendario currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'mural-fotos' && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cardapio' && <AdminCardapio currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'diario' && <AdminDiario currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'materias' && <AdminSubjects currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'frequencia' && <AdminFrequencia currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'rel-mitigacao' && <AdminMitigacao currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'auditoria' && <AdminAuditLog currentUser={currentUser} currentSchool={currentSchool} />}
        {RELATORIOS_SUBMENU.filter(r => r.key !== 'rel-mitigacao').map(r => adminTab === r.key && (
          <AdminRelatorioPlaceholder key={r.key} title={r.label} />
        ))}
        {adminTab === 'cadastro-funcionarios' && <AdminCadastroFuncionarios currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'gerenciar-funcionarios' && <AdminGerenciarFuncionarios currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cadastro-comunicados' && <AdminCadastroComunicados currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'financeiro' && <AdminFinanceiro currentUser={currentUser} currentSchool={currentSchool} />}

        {/* MONITOR */}
        {adminTab === 'monitor' && (
          <div className={`h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border-2 transition-all duration-500 overflow-hidden ${newArrival ? 'border-amber-400 shadow-amber-100 shadow-lg' : 'border-outline-variant'}`}>

            {/* Header do Monitor */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h2 className="text-h3 text-on-surface">Monitor de Solicitações</h2>
                  <p className="text-small text-on-surface-variant">Acompanhe as solicitações em tempo real</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                {monitorStudents.length > 1 && (
                  <button
                    onClick={handleApproveAll}
                    disabled={bulkApproving}
                    className="w-full sm:w-auto flex justify-center items-center gap-2 font-bold text-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 px-4 py-2.5 rounded-zela-md shadow-sm active:scale-95 transition-all"
                  >
                    {bulkApproving
                      ? <><Loader2 size={16} className="animate-spin" /> Aprovando…</>
                      : <><CheckCheck size={16} /> Aprovar todas ({monitorStudents.length})</>}
                  </button>
                )}
              </div>
            </div>

            {/* Alerta de nova chegada */}
            {newArrival && (
              <div className="mb-5 p-4 bg-amber-50 border border-amber-300 rounded-zela-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 shrink-0">
                <Bell className="text-amber-600 shrink-0 animate-bounce" size={22} />
                <div>
                  <p className="font-bold text-amber-800">Nova atualização no painel!</p>
                  <p className="text-xs text-amber-600">Confirme a solicitação de check-in/out abaixo.</p>
                </div>
              </div>
            )}

            {/* Cards dos alunos */}
            {monitorStudents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
                <Car className="mx-auto h-12 w-12 text-outline-variant mb-3" />
                <h3 className="text-on-surface-variant font-medium">Nenhuma solicitação no momento.</h3>
                <p className="text-on-surface-variant/70 text-sm mt-1">O painel atualiza automaticamente com o totem e avisos das famílias.</p>
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
                      badgeClass = "text-primary"; badgeText = "Solicitação de Saída";
                      btnClass = "bg-primary hover:bg-primary-container text-white"; btnText = "Confirmar Saída";
                      btnActionStatus = "left";
                      cancelStatus = "in_school";
                      borderColor = "border-primary/40"; bgColor = "bg-primary/5";
                    }

                    const requester = student.pendingRequesterId ? (authorized || []).find(p => p.id === student.pendingRequesterId) : null;

                    return (
                      <div
                        key={student.id}
                        className={`relative p-5 border-2 ${borderColor} ${bgColor} rounded-zela-lg shadow-sm animate-in zoom-in-95 duration-300`}
                      >
                        {requester?.photo_url && (
                          <img
                            src={requester.photo_url}
                            alt={requester.name}
                            title={requester.name}
                            className="absolute top-3 right-3 w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
                          />
                        )}
                        <p className={`text-[10px] md:text-xs font-bold uppercase mb-1 flex items-center gap-1 pr-11 ${badgeClass}`}>
                          <Clock size={12} /> {badgeText}
                        </p>
                        <h3 className="font-bold text-lg text-on-surface mb-4 pr-11">{student.name}</h3>
                        <div className="flex flex-col gap-2">
                          {/* Botão APROVAR: confirma o check-in/out e grava no attendance_logs */}
                          <button
                            title={student.status === 'pending_entry' ? 'Confirmar Check-in' : 'Confirmar Check-out'}
                            onClick={() => updateStudentStatus(student.id, btnActionStatus)}
                            className={`w-full font-bold py-3 rounded-zela-md active:scale-95 transition-all shadow-sm ${btnClass}`}
                          >
                            {btnText}
                          </button>
                          {/* Botão CANCELAR: reverte status sem gravar no attendance_logs */}
                          <button
                            title="Rejeitar solicitação"
                            onClick={() => rejectStudentStatus(student.id, cancelStatus)}
                            className="w-full font-semibold py-2 rounded-zela-md text-on-surface-variant bg-surface-container-lowest border border-outline-variant hover:bg-red-50 hover:text-red-500 hover:border-red-200 active:scale-95 transition-all"
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

        {/* AUTOATENDIMENTO — layout "Totem Institucional": fundo branco, faixa
            superior fina com o nome da escola, barra de acento na cor da
            marca acima do título, botões com chip de ícone. Referência
            visual: quiosques de aeroporto/banco — sóbrio e muito legível,
            pensado pra ficar bom tanto no tablet do totem quanto no
            celular. */}
        {adminTab === 'kiosk' && (
          <div className="relative h-full bg-white rounded-zela-xl shadow-sm border border-outline-variant flex flex-col overflow-hidden">
            {/* Faixa superior: nome da escola + engrenagem de configurações
                (cadastrar foto de responsáveis que esqueceram de fazer pelo
                Portal da Família) */}
            <div className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-outline-variant shrink-0">
              <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-on-surface truncate pr-3">
                {currentSchool?.name || 'Autoatendimento'}
              </span>
              <button
                onClick={() => setIsFaceEnrollmentOpen(true)}
                title="Cadastrar foto de responsáveis"
                className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition shrink-0"
              >
                <Settings size={18} />
              </button>
            </div>

            {/* Conteúdo central */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-8 overflow-y-auto">
              <div className="w-full max-w-md">
                <div className="w-10 h-1 rounded-full bg-primary mb-4"></div>
                <h2 className="text-2xl sm:text-3xl font-bold text-on-surface mb-1.5">Identifique-se</h2>
                <p className="text-on-surface-variant text-sm mb-8">
                  {currentSchool?.plan === 'pro' ? 'Selecione como deseja continuar' : 'Toque para digitar sua senha'}
                </p>

                <div className="flex flex-col gap-3">
                  {currentSchool?.plan === 'pro' && (
                    <button
                      onClick={() => setIsFaceScannerOpen(true)}
                      className="flex items-center gap-3.5 bg-primary hover:bg-primary-container text-white p-4 sm:p-5 rounded-zela-lg transition-all shadow-sm active:scale-[0.98] group"
                    >
                      <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <Camera size={20} />
                      </span>
                      <span className="font-bold text-sm sm:text-base text-left">Reconhecimento Facial</span>
                    </button>
                  )}

                  <button
                    onClick={() => setIsPasswordLoginOpen(true)}
                    className="flex items-center gap-3.5 bg-white text-on-surface border-2 border-outline-variant hover:border-primary/50 p-4 sm:p-5 rounded-zela-lg transition-all active:scale-[0.98] group"
                  >
                    <span className="w-11 h-11 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <KeyRound size={20} />
                    </span>
                    <span className="font-bold text-sm sm:text-base text-left">Senha / PIN</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PRESENÇA */}
        {adminTab === 'presence' && <AdminDailyPresence currentUser={currentUser} currentSchool={currentSchool} />}

        {/* GESTÃO */}
        {adminTab === 'users' && <AdminUserManagement currentUser={currentUser} initialTab={usersInitialTab} />}

        {/* LISTA DE ALUNOS */}
        {adminTab === 'students' && <AdminStudentList currentUser={currentUser} />}

        {/* HISTÓRICO */}
        {adminTab === 'history' && <AdminHistory currentSchool={currentSchool} currentUser={currentUser} />}

        {/* HORAS EXTRAS */}
        {adminTab === 'horas-extras' && <AdminRelatorioHorasExtras currentSchool={currentSchool} />}

        {/* CORREÇÕES DE PRESENÇA */}
        {adminTab === 'attendance-corrections' && <AdminAttendanceCorrections currentUser={currentUser} />}

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

        {/* Cadastro de Foto de Responsáveis */}
        {isFaceEnrollmentOpen && createPortal(
          <Suspense fallback={null}>
            <AdminFaceEnrollment
              onClose={() => setIsFaceEnrollmentOpen(false)}
              authorized={authorized}
              togglePhoto={togglePhoto}
              students={students}
              currentUser={currentUser}
            />
          </Suspense>,
          document.body
        )}

        {kioskExitTarget && (
          <ConfirmExitPassword
            email={currentUser?.email}
            onConfirm={confirmKioskExit}
            onCancel={() => setKioskExitTarget(null)}
          />
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
