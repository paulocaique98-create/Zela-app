import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, UserRound, Clock, Bell, ShieldCheck, KeyRound, Users, CalendarDays, Settings, Camera, Smartphone, Home, FolderPlus, Folders, FileText, Image as ImageIcon, UtensilsCrossed, MessageCircle, X, Maximize2, Minimize2, ScrollText, Megaphone, BookOpen, BookMarked, ClipboardCheck, CheckCheck, Loader2, LogOut, Fingerprint, RefreshCw, Briefcase, FileSignature, LayoutTemplate, Receipt, Truck, AlertOctagon, BarChart3 } from 'lucide-react';
import TrilhaConfirmacao from './TrilhaConfirmacao';
import { supabase } from '../lib/supabase';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import { usePendingUsersCount } from '../hooks/usePendingUsersCount';
import { useUnreadSystemUpdates } from '../hooks/useUnreadSystemUpdates';
import { usePushNotifications } from '../hooks/usePushNotifications';
import PushGuidanceModal from './PushGuidanceModal';
import { useSchoolConfig } from '../lib/schoolConfig';
import { useAtualizacaoDoTotem } from '../hooks/useAtualizacaoDoTotem';
import { lembrarLeitorAberto, leitorParaReabrir, esquecerLeitorAberto } from '../lib/atualizacaoDoTotem';
import AdminInicio from './AdminInicio';
import LoadingLogo from './LoadingLogo';
import { preloadFaceModels } from '../lib/faceModels';
import CheckinAlertModal from './CheckinAlertModal';
import ConfirmExitPassword from './ConfirmExitPassword';
import ConfirmModal from './ConfirmModal';
import { logAction } from '../lib/auditLog';
import { SidebarItem, SidebarGroup, SidebarToggleButton } from './SidebarNav';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';
import KioskClock from './KioskClock';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { usePermissions } from '../hooks/usePermissions';
import { PageShell } from './GestaoShared';

// Lazy: cada tela só entra no bundle quando o admin realmente abre aquela aba
// — reduz bastante o carregamento inicial do painel (dezenas de telas, a
// maioria acessada só ocasionalmente).
const AdminFichaMedica = lazy(() => import('./AdminFichaMedica'));
const AdminQrCheckin = lazy(() => import('./AdminQrCheckin'));
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
const AdminQrScanner = lazy(() => import('./AdminQrScanner'));
const AdminPasswordLogin = lazy(() => import('./AdminPasswordLogin'));
const AdminHistory = lazy(() => import('./AdminHistory'));
const AdminSettings = lazy(() => import('./AdminSettings'));
const AdminMitigacao = lazy(() => import('./AdminMitigacao'));
const AdminMapaHabilidades = lazy(() => import('./AdminMapaHabilidades'));
const AdminAuditLog = lazy(() => import('./AdminAuditLog'));
const AdminSystemUpdates = lazy(() => import('./AdminSystemUpdates'));
const AdminDuplicateBiometrics = lazy(() => import('./AdminDuplicateBiometrics'));
const AdminFaceEnrollment = lazy(() => import('./AdminFaceEnrollment'));
const AdminSubjects = lazy(() => import('./AdminSubjects'));
const AdminFrequencia = lazy(() => import('./AdminFrequencia'));
// Módulos da Gestão que a Gestão pode liberar pro Administrativo
// (Gestão · Permissões).
const GestaoContratos = lazy(() => import('./GestaoContratos'));
const GestaoDespesas = lazy(() => import('./GestaoDespesas'));
const GestaoFornecedores = lazy(() => import('./GestaoFornecedores'));
const GestaoRelatorios = lazy(() => import('./GestaoRelatorios'));
const CobrancasTab = lazy(() => import('./AdminFinanceiro').then(m => ({ default: m.CobrancasTab })));

// Submenus do menu Relatórios — cada um vira sua própria tela conforme for
// implementado; por enquanto todos apontam para o placeholder "em construção".
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-mapa-habilidades', label: 'Mapa de Habilidades' },
];

export default function AdminPortal({ currentUser, currentSchool, students, adminTab, setAdminTab, updateStudentStatus, rejectStudentStatus, requestKioskAccess, authorized, togglePhoto, onUpdateSchool, isMobileMenuOpen, setIsMobileMenuOpen, pendingAlert, onDismissAlert, onGoToMonitor, onLogout, connectionStatus, updateAvailable = false }) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);
  const { count: pendingUsersCount } = usePendingUsersCount(currentUser);
  const { hasUnread: hasUnreadSystemUpdates, refresh: refreshUnreadSystemUpdates } = useUnreadSystemUpdates(currentUser);
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

  const monitorStudents = students
    .filter(s => ['pending_entry', 'pending_exit'].includes(s.status))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const prevMonitorCount = useRef(monitorStudents.length);
  const [newArrival, setNewArrival] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  // Achado real (16/09): "Cancelar Solicitação" no Monitor não tinha
  // nenhuma confirmação — um clique sem querer apagava a solicitação sem
  // deixar rastro nenhum (nem log de auditoria), e ninguém percebia até a
  // família reclamar. Agora exige confirmação explícita e fica registrado.
  const [cancelTarget, setCancelTarget] = useState(null); // { student, cancelStatus, btnText } | null
  const [isCancelling, setIsCancelling] = useState(false);

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

  const confirmCancelRequest = async () => {
    if (!cancelTarget || isCancelling) return;
    setIsCancelling(true);
    try {
      await rejectStudentStatus(cancelTarget.student.id, cancelTarget.cancelStatus);
      // Best-effort: fica registrado em Sistema > Auditoria quem cancelou,
      // quando e de qual aluno — antes disso não sobrava rastro nenhum.
      logAction({
        actorId: currentUser.id,
        schoolId: currentUser.school_id,
        action: 'cancel_checkin_request',
        entityType: 'student',
        entityId: cancelTarget.student.id,
        details: { name: cancelTarget.student.name, tipo: cancelTarget.badgeText },
      });
      setCancelTarget(null);
    } catch (err) {
      console.error('Erro ao cancelar solicitação:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  // Depois de uma atualização automática do totem, o leitor que estava
  // aberto (rosto ou QR) volta aberto sozinho.
  const [isFaceScannerOpen, setIsFaceScannerOpen] = useState(() => adminTab === 'kiosk' && leitorParaReabrir() === 'rosto');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(() => adminTab === 'kiosk' && leitorParaReabrir() === 'qr');
  useEffect(() => { esquecerLeitorAberto(); }, []);
  const [isPasswordLoginOpen, setIsPasswordLoginOpen] = useState(false);
  const [isFaceEnrollmentOpen, setIsFaceEnrollmentOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);

  // Atualização automática do Autoatendimento (01/10/2026): com versão nova
  // publicada, recarrega quando ninguém usa o totem há alguns minutos.
  useAtualizacaoDoTotem({
    ativo: adminTab === 'kiosk',
    versaoNova: updateAvailable,
    antesDeRecarregar: () => {
      if (isFaceScannerOpen) lembrarLeitorAberto('rosto');
      else if (isQrScannerOpen) lembrarLeitorAberto('qr');
    },
  });

  // Estados dos Accordions
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => {
    setOpenAccordion(openAccordion === name ? null : name);
  };

  // Expandir/recolher por clique (persistido em localStorage) -- antes era
  // por hover, o que fazia o menu abrir/fechar sozinho só de passar o mouse.
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();
  // No mobile o menu sempre aparece em tela cheia (com rótulos), mesmo que a
  // preferência salva seja "recolhido" -- o colapso só existe visualmente no
  // desktop, então os grupos com submenu só abrem em flyout quando é
  // desktop E está recolhido.
  const isDesktop = useIsDesktop();
  const collapsed = isDesktop && !isSidebarExpanded;
  const perms = usePermissions(currentUser);
  const canSeeContratos = perms['contratos.ver'] || perms['contratos.gerenciar'];
  const canSeeDespesas = perms['despesas.ver'] || perms['despesas.gerenciar'];
  const hasGestaoModules = canSeeContratos || canSeeDespesas || perms['fornecedores.gerenciar'] || perms['financeiro.baixa_manual'] || perms['relatorios.financeiro.ver'];
  // A senha só é exigida pra SAIR do Autoatendimento pra qualquer outro menu
  // (a tela fica exposta pra qualquer pessoa durante o check-in) — não mais
  // pra fechar a tela de biometria/PIN em si, que agora fecha direto no X
  // (ver AdminFaceScanner.jsx / AdminPasswordLogin.jsx).
  const [kioskExitTarget, setKioskExitTarget] = useState(null);
  // Menu da engrenagem no Autoatendimento (tela cheia, sem Header): reúne
  // "Cadastrar biometria" (ação de sempre) e "Sair", já que o botão de sair
  // do Header não existe mais nessa tela.
  const [isKioskSettingsOpen, setIsKioskSettingsOpen] = useState(false);
  const applyTabChange = (tab) => {
    setAdminTab(tab);
    registerClick(tab);
    setIsMobileMenuOpen(false);
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
  // O menu segue só os módulos da escola (Módulos, no Portal do Dev). A
  // antiga preferência "Personalizar Menu" (só do navegador) saiu em 30/09/2026.

  const showCadastros = features.cadastros !== false;
  const showGerenciamento = features.gerenciamento !== false;
  const showCheckin = features.checkin !== false;
  const showConfiguracoes = features.configuracoes !== false;

  const showFormularios = features.formularios === true;
  const showCalendario = features.calendario === true;
  const showComunicados = features.comunicados === true;
  const showMural = features.mural === true;
  const showCardapio = features.cardapio === true;
  const showDiario = features.diario === true;
  const showChat = features.chat === true;
  const showRelatorios = features.relatorios_pedagogicos === true;
  const showMaterias = features.materias === true;
  const showFrequencia = features.frequencia === true;
  const showQrCheckin = features.qr_checkin === true;
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
  // Entrar no Autoatendimento fecha o chat da Recepção, se estiver aberto
  // (o botão também some lá; ver o chat flutuante no fim do componente).
  useEffect(() => {
    if (adminTab === 'kiosk') setIsChatOpen(false);
  }, [adminTab]);

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
    <div className="flex flex-col md:flex-row gap-0 w-full h-full animate-in fade-in md:relative">

      {/* MENU LATERAL (SIDEBAR) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      {/* No Autoatendimento o Header some; esta faixa preenche o topo do menu lateral */}
      {adminTab === 'kiosk' && (
        <div aria-hidden="true" className={`hidden md:block fixed top-0 left-0 h-16 bg-ink z-30 ${isSidebarExpanded ? 'w-[248px]' : 'w-[72px]'}`} />
      )}

      <aside
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:sticky top-[60px] md:top-16 left-0 h-[calc(100dvh-60px)] md:h-[calc(100dvh-4rem)] w-72 shrink-0 z-20 md:z-30 bg-ink border-r border-ink-line transform transition-all duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarExpanded ? 'md:w-[248px]' : 'md:w-[72px]'}`}
      >
        <SidebarToggleButton isExpanded={isSidebarExpanded} onToggle={toggleSidebarExpanded} />
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 md:px-[18px] md:group-data-[expanded=true]/side:px-4 pt-4 pb-2 space-y-1">
            <SidebarItem active={adminTab === 'home'} icon={Home} label="Início" onClick={() => go('home')} />

            {/* CADASTROS */}
            {showCadastros && (
              <SidebarGroup
                collapsed={collapsed}
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
                collapsed={collapsed}
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
                collapsed={collapsed}
                label="Formulários"
                icon={FileText}
                isOpen={openAccordion === 'formularios'}
                onToggle={() => toggleAccordion('formularios')}
              >
                <SidebarItem active={adminTab === 'ficha-medica'} icon={FileText} label="Ficha Médica" onClick={() => go('ficha-medica')} />
              </SidebarGroup>
            )}

            {/* CHECK-IN/OUT */}
            {showCheckin && (
              <SidebarGroup
                collapsed={collapsed}
                label="Check-in/out"
                icon={ShieldCheck}
                badge={monitorStudents.length > 0 ? monitorStudents.length : null}
                isOpen={openAccordion === 'checkin'}
                onToggle={() => toggleAccordion('checkin')}
              >
                <SidebarItem active={adminTab === 'monitor'} icon={ShieldCheck} label="Monitor" badge={monitorStudents.length > 0 ? monitorStudents.length : null} onClick={() => go('monitor')} />
                <SidebarItem active={adminTab === 'kiosk'} icon={Smartphone} label="Autoatendimento" onClick={() => go('kiosk')} />
                {showQrCheckin && (
                  <SidebarItem active={adminTab === 'qr-checkin'} icon={Fingerprint} label="Carteirinhas QR" onClick={() => go('qr-checkin')} />
                )}
                <SidebarItem active={adminTab === 'presence'} icon={CalendarDays} label="Presença Diária" onClick={() => go('presence')} />
                <SidebarItem active={adminTab === 'history'} icon={ScrollText} label="Histórico Geral" onClick={() => go('history')} />
              </SidebarGroup>
            )}

            {/* RELATÓRIOS PEDAGÓGICOS */}
            {showRelatorios && (
              <SidebarGroup
                collapsed={collapsed}
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
                collapsed={collapsed}
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

            {/* GESTÃO: só o que a Gestão liberou em Permissões */}
            {hasGestaoModules && (
              <SidebarGroup
                collapsed={collapsed}
                label="Gestão"
                icon={Briefcase}
                isOpen={openAccordion === 'gestao'}
                onToggle={() => toggleAccordion('gestao')}
              >
                {canSeeContratos && <SidebarItem active={adminTab === 'gestao-contratos'} icon={FileSignature} label="Contratos" onClick={() => go('gestao-contratos')} />}
                {perms['contratos.gerenciar'] && <SidebarItem active={adminTab === 'gestao-modelos'} icon={LayoutTemplate} label="Modelos de Contrato" onClick={() => go('gestao-modelos')} />}
                {perms['financeiro.baixa_manual'] && <SidebarItem active={adminTab === 'gestao-inadimplencia'} icon={AlertOctagon} label="Inadimplência" onClick={() => go('gestao-inadimplencia')} />}
                {canSeeDespesas && <SidebarItem active={adminTab === 'gestao-despesas'} icon={Receipt} label="Despesas" onClick={() => go('gestao-despesas')} />}
                {perms['fornecedores.gerenciar'] && <SidebarItem active={adminTab === 'gestao-fornecedores'} icon={Truck} label="Fornecedores" onClick={() => go('gestao-fornecedores')} />}
                {perms['relatorios.financeiro.ver'] && <SidebarItem active={adminTab === 'gestao-relatorio-financeiro'} icon={BarChart3} label="Relatório Financeiro" onClick={() => go('gestao-relatorio-financeiro')} />}
              </SidebarGroup>
            )}

            {/* SISTEMA */}
            {showConfiguracoes && (
              <SidebarGroup
                collapsed={collapsed}
                label="Sistema"
                icon={Settings}
                isOpen={openAccordion === 'sistema'}
                onToggle={() => toggleAccordion('sistema')}
              >
                <SidebarItem active={adminTab === 'auditoria'} icon={ScrollText} label="Auditoria" onClick={() => go('auditoria')} />
                {/* "•" em vez de número -- só indica que existe novidade não
                    lida, não quantas (pedido explícito). */}
                <SidebarItem active={adminTab === 'system-updates'} icon={RefreshCw} label="Atualizações" badge={hasUnreadSystemUpdates ? '•' : null} onClick={() => go('system-updates')} />
                <SidebarItem active={adminTab === 'duplicidade-biometrica'} icon={Fingerprint} label="Duplicidade Facial" onClick={() => go('duplicidade-biometrica')} />
                <SidebarItem active={adminTab === 'settings'} icon={Settings} label="Configurações" onClick={() => go('settings')} />
              </SidebarGroup>
            )}
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      {/* A linha que separava header de sidebar foi removida (ver Header.jsx
          `flush`) -- em vez disso, essa borda no topo do CONTEÚDO (não da
          sidebar) recria a mesma linha só a partir de onde a sidebar termina,
          como uma continuação do border-r dela, sem risco em cima do próprio
          menu lateral. */}
      <main className={`flex-1 min-w-0 h-full flex flex-col ${adminTab === 'kiosk' ? '' : 'border-t border-outline-variant/60'}`}>
      {/* BANNER NOTIFICAÇÕES PUSH — mesmo padrão de FamilyPortal.jsx.
          Sem isso, notifyAdmins() nunca tem pra quem mandar push (a
          escola nunca teria se inscrito). */}
      {pushData.permission === 'default' && !pushData.isSubscribed && !dismissedPush && (
        <div className="bg-brass-50 border-b border-brass px-4 py-3 flex items-center gap-3 justify-between shrink-0">
          <div className="flex items-center gap-2 text-on-surface text-sm font-medium min-w-0 flex-1">
            <Bell size={18} className="text-warning shrink-0" />
            <span className="truncate">Ative as notificações para saber na hora quando um responsável se cadastrar</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={pushData.subscribe} disabled={pushData.isLoading} className="text-xs font-semibold text-white bg-primary hover:bg-primary-container min-h-[44px] px-3 py-1.5 rounded-md transition-colors whitespace-nowrap">
              Ativar
            </button>
            <button onClick={dismissPushBanner} aria-label="Fechar aviso" className="text-on-surface-variant hover:text-on-surface min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-brass-50 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      <PushGuidanceModal guidance={pushData.guidance} onClose={pushData.dismissGuidance} />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingLogo logoUrl={currentSchool?.logo_url} size={72} /></div>}>

        {/* INICIO */}
        {adminTab === 'home' && <AdminInicio currentUser={currentUser} currentSchool={currentSchool} setAdminTab={setAdminTab} registerClick={registerClick} clickCounts={clickCounts} monitorCount={monitorStudents.length} pendingUsersCount={pendingUsersCount} onGoToPendingUsers={goToPendingUsers} />}

        {/* NOVOS PLACEHOLDERS */}
        {adminTab === 'ficha-medica' && <AdminFichaMedica currentUser={currentUser} currentSchool={currentSchool} students={students} />}
        {adminTab === 'calendario' && <AdminCalendario currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'mural-fotos' && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cardapio' && <AdminCardapio currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'diario' && <AdminDiario currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'materias' && <AdminSubjects currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'frequencia' && <AdminFrequencia currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'rel-mitigacao' && <AdminMitigacao currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'auditoria' && <AdminAuditLog currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'gestao-contratos' && canSeeContratos && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="lista" canManage={Boolean(perms['contratos.gerenciar'])} />}
        {adminTab === 'gestao-modelos' && perms['contratos.gerenciar'] && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="modelos" />}
        {adminTab === 'gestao-inadimplencia' && perms['financeiro.baixa_manual'] && (
          <PageShell description="Cobranças vencidas e não pagas. Registre aqui o que foi pago por fora."><CobrancasTab currentUser={currentUser} initialStatus="OVERDUE" canRegisterPayment /></PageShell>
        )}
        {adminTab === 'gestao-despesas' && canSeeDespesas && <GestaoDespesas currentUser={currentUser} canManage={Boolean(perms['despesas.gerenciar'])} />}
        {adminTab === 'gestao-fornecedores' && perms['fornecedores.gerenciar'] && <GestaoFornecedores currentUser={currentUser} />}
        {adminTab === 'gestao-relatorio-financeiro' && perms['relatorios.financeiro.ver'] && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="financeiro" />}
        {adminTab === 'system-updates' && <AdminSystemUpdates currentUser={currentUser} onRead={refreshUnreadSystemUpdates} />}
        {adminTab === 'duplicidade-biometrica' && <AdminDuplicateBiometrics currentUser={currentUser} />}
        {adminTab === 'rel-mapa-habilidades' && <AdminMapaHabilidades currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cadastro-funcionarios' && <AdminCadastroFuncionarios currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'gerenciar-funcionarios' && <AdminGerenciarFuncionarios currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cadastro-comunicados' && <AdminCadastroComunicados currentUser={currentUser} currentSchool={currentSchool} />}

        {/* MONITOR */}
        {adminTab === 'monitor' && (
          <div className={`h-full flex flex-col bg-surface-container-lowest -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-zela-xl md:rounded-none border transition-colors duration-500 overflow-hidden ${newArrival ? 'border-brass' : 'border-outline-variant'}`}>

            {/* Header do Monitor -- título "Monitor de Solicitações" removido
                (o Header do app já mostra o nome da tela dinamicamente); o
                indicador de status do tempo real se junta ao ícone. */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative bg-primary/10 p-2.5 rounded-md text-primary">
                  <AlertCircle size={22} />
                  {/* Indicador de status do tempo real — antes disso, uma queda
                      silenciosa do Realtime só era percebida no Console do
                      navegador. Amarelo/vermelho não significa que o Monitor
                      parou: a reconciliação por polling continua atualizando
                      a lista sozinha em segundo plano. */}
                  <span
                    className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface-container-lowest shrink-0 ${
                      connectionStatus === 'connected' ? 'bg-success' :
                      connectionStatus === 'connecting' ? 'bg-brass motion-safe:animate-pulse' : 'bg-error'
                    }`}
                    title={
                      connectionStatus === 'connected' ? 'Tempo real conectado' :
                      connectionStatus === 'connecting' ? 'Conectando ao tempo real…' :
                      'Tempo real instável — atualizando por verificação periódica'
                    }
                  />
                </div>
                <p className="text-small text-on-surface-variant">Acompanhe as solicitações em tempo real</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                {monitorStudents.length > 1 && (
                  <button
                    onClick={handleApproveAll}
                    disabled={bulkApproving}
                    className="w-full sm:w-auto flex justify-center items-center gap-2 font-semibold text-sm text-white bg-primary hover:bg-primary-container disabled:opacity-60 min-h-[44px] px-4 py-2.5 rounded-md transition"
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
              <div role="status" className="mb-5 p-4 bg-brass-50 border border-brass border-l-4 rounded-md flex items-center gap-3 shrink-0">
                <Bell className="text-warning shrink-0" size={22} />
                <div>
                  <p className="font-semibold text-on-surface">Nova solicitação no painel</p>
                  <p className="text-xs text-on-surface-variant">Confirme a solicitação de entrada ou saída abaixo.</p>
                </div>
              </div>
            )}

            {/* Cards dos alunos */}
            {monitorStudents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 bg-surface-container-low rounded-md border border-dashed border-outline-variant">
                <UserRound className="mx-auto h-12 w-12 text-outline-variant mb-3" />
                <h3 className="text-on-surface-variant font-medium">Nenhuma solicitação no momento.</h3>
                <p className="text-on-surface-variant/70 text-sm mt-1">O painel atualiza automaticamente com o totem e avisos das famílias.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                  {monitorStudents.map(student => {
                    let badgeText, btnClass, btnText, btnActionStatus, cancelStatus, faixaColor;

                    if (student.status === 'pending_entry') {
                      badgeText = "Solicitação de entrada";
                      btnClass = "bg-success hover:brightness-110 text-white"; btnText = "Confirmar entrada";
                      btnActionStatus = "in_school";
                      cancelStatus = "idle";
                      faixaColor = "border-l-success";
                    } else if (student.status === 'pending_exit') {
                      badgeText = "Solicitação de saída";
                      btnClass = "bg-primary hover:bg-primary-container text-white"; btnText = "Confirmar saída";
                      btnActionStatus = "left";
                      cancelStatus = "in_school";
                      faixaColor = "border-l-primary";
                    }

                    const requester = student.pendingRequesterId ? (authorized || []).find(p => p.id === student.pendingRequesterId) : null;

                    return (
                      <div
                        key={student.id}
                        className={`relative p-5 bg-surface-container-lowest border border-outline-variant border-l-4 ${faixaColor} rounded-md`}
                      >
                        {requester?.photo_url && (
                          <img
                            src={requester.photo_url}
                            alt={requester.name}
                            title={requester.name}
                            className="absolute top-3 right-3 w-10 h-10 rounded-full object-cover border border-outline-variant"
                          />
                        )}
                        <p className="text-xs font-semibold text-on-surface-variant mb-1 flex items-center gap-1 pr-11">
                          <Clock size={12} /> {badgeText}
                        </p>
                        <h3 className="font-semibold text-lg text-on-surface mb-3 pr-11">{student.name}</h3>
                        {/* Trilha: a solicitação já passou pelo responsável e pelo totem; falta a recepção. */}
                        <TrilhaConfirmacao atual={2} className="mb-4" />
                        <div className="flex flex-col gap-2">
                          {/* Botão APROVAR: confirma o check-in/out e grava no attendance_logs */}
                          <button
                            title={student.status === 'pending_entry' ? 'Confirmar Check-in' : 'Confirmar Check-out'}
                            onClick={() => updateStudentStatus(student.id, btnActionStatus)}
                            className={`w-full font-semibold min-h-[48px] py-3 rounded-md transition ${btnClass}`}
                          >
                            {btnText}
                          </button>
                          {/* Botão CANCELAR: reverte status sem gravar no attendance_logs.
                              Abre confirmação em vez de agir direto no clique —
                              cancelamento é irreversível e sem isso um toque sem
                              querer apagava a solicitação sem deixar rastro. */}
                          <button
                            title="Rejeitar solicitação"
                            onClick={() => setCancelTarget({ student, cancelStatus, badgeText })}
                            className="w-full font-semibold min-h-[44px] py-2 rounded-md text-on-surface-variant bg-surface-container-lowest border border-outline-variant hover:bg-error/10 hover:text-error hover:border-error transition"
                          >
                            Cancelar solicitação
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
          // Sem rounded/border/shadow de propósito: com o Header oculto (ver
          // App.jsx > isKioskFullscreen) e o <main> sem padding, esse bloco
          // já ocupa a tela inteira — uma "borda" flutuante ficaria estranha
          // encostada na tela de verdade.
          <div className="relative h-full bg-white flex flex-col overflow-hidden">
            {/* Faixa superior: nome da escola + engrenagem de configurações
                (cadastrar foto de responsáveis, e agora também Sair — o
                botão de sair do Header não existe mais nesta tela) */}
            <div className="flex items-center justify-between px-5 sm:px-8 h-[60px] md:h-16 bg-ink text-ink-text shrink-0">
              <span className="text-sm sm:text-base font-semibold text-white truncate pr-3">
                Zela Escola
              </span>
              <div className="relative shrink-0">
                <button
                  onClick={() => setIsKioskSettingsOpen(v => !v)}
                  title="Configurações do Autoatendimento"
                  aria-label="Configurações do Autoatendimento" className="min-w-11 min-h-11 flex items-center justify-center text-ink-text hover:text-white hover:bg-ink-2 rounded-md transition"
                >
                  <Settings size={18} />
                </button>
                {isKioskSettingsOpen && (
                  <>
                    {/* Fecha ao clicar fora, sem precisar de lib de popover */}
                    <div className="fixed inset-0 z-10" onClick={() => setIsKioskSettingsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-outline-variant rounded-zela-lg shadow-lg py-1.5 z-20 animate-in fade-in zoom-in-95 duration-150">
                      <button
                        onClick={() => { setIsKioskSettingsOpen(false); setIsFaceEnrollmentOpen(true); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition text-left"
                      >
                        <Camera size={16} className="text-on-surface-variant/70" /> Biometria de Responsáveis
                      </button>
                      <div className="h-px bg-outline-variant my-1" />
                      {/* Voltar: sai do Autoatendimento pra tela inicial, sem
                          deslogar — continua exigindo a senha (mesma trava
                          de sair do kiosk pra qualquer outro menu). */}
                      <button
                        onClick={() => { setIsKioskSettingsOpen(false); go('home'); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition text-left"
                      >
                        <Home size={16} className="text-on-surface-variant/70" /> Voltar ao Início
                      </button>
                      {/* Sair: desloga da conta de verdade. */}
                      <button
                        onClick={() => { setIsKioskSettingsOpen(false); onLogout?.(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 transition text-left"
                      >
                        <LogOut size={16} /> Sair
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Conteúdo central */}
            <div className="flex-1 flex flex-col items-center justify-start px-5 sm:px-8 pt-[72px] sm:pt-20 pb-8 overflow-y-auto">
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

                  {showQrCheckin && (
                    <button
                      onClick={() => setIsQrScannerOpen(true)}
                      className="flex items-center gap-3.5 bg-white text-on-surface border-2 border-outline-variant hover:border-primary/50 p-4 sm:p-5 rounded-zela-lg transition-all active:scale-[0.98] group"
                    >
                      <span className="w-11 h-11 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <Fingerprint size={20} />
                      </span>
                      <span className="font-bold text-sm sm:text-base text-left">QR Code do Aluno</span>
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

              <div className="w-full max-w-md mt-[50px]">
                <KioskClock />
              </div>
            </div>
          </div>
        )}

        {/* PRESENÇA */}
        {adminTab === 'presence' && <AdminDailyPresence currentUser={currentUser} currentSchool={currentSchool} />}

        {/* CARTEIRINHAS QR */}
        {adminTab === 'qr-checkin' && <AdminQrCheckin students={students} currentSchool={currentSchool} />}

        {/* GESTÃO */}
        {adminTab === 'users' && <AdminUserManagement currentUser={currentUser} initialTab={usersInitialTab} />}

        {/* LISTA DE ALUNOS */}
        {adminTab === 'students' && <AdminStudentList currentUser={currentUser} />}

        {/* HISTÓRICO */}
        {adminTab === 'history' && <AdminHistory currentSchool={currentSchool} currentUser={currentUser} />}

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

        {isQrScannerOpen && createPortal(
          <Suspense fallback={null}>
            <AdminQrScanner
              onClose={() => setIsQrScannerOpen(false)}
              requestKioskAccess={requestKioskAccess}
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

        {/* Confirmação de cancelamento de solicitação — ver comentário em
            confirmCancelRequest, gap real encontrado em produção. */}
        {cancelTarget && createPortal(
          <ConfirmModal
            title="Cancelar solicitação?"
            message={`Isso vai cancelar a solicitação de ${cancelTarget.badgeText?.toLowerCase()} de ${cancelTarget.student.name}. A família vai precisar refazer o reconhecimento no totem.`}
            confirmLabel="Cancelar solicitação"
            cancelLabel="Voltar"
            isLoading={isCancelling}
            onConfirm={confirmCancelRequest}
            onCancel={() => setCancelTarget(null)}
          />,
          document.body
        )}

        {/* Chat flutuante — canto inferior direito, em todas as abas MENOS o
            Autoatendimento (kiosk): o totem fica de frente para as famílias e
            o chat ali é o da Recepção (28/09/2026). */}
        {showChat && adminTab !== 'kiosk' && createPortal(
          <>
            <button
              onClick={() => {
                setIsChatOpen(o => !o);
                setIsChatExpanded(false);
                if (isChatOpen) refreshChatUnread();
              }}
              className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-md bg-primary hover:bg-primary-container text-white shadow-lg flex items-center justify-center transition-colors"
              title="Chat"
              aria-label="Chat"
            >
              {isChatOpen ? <X size={24} /> : <MessageCircle size={24} />}
              {!isChatOpen && chatUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-error text-white text-[10px] font-semibold flex items-center justify-center border-2 border-surface-container-lowest">
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
